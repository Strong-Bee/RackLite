import http from 'node:http';
import { parse } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import next from 'next';
import { WebSocketServer, type WebSocket } from 'ws';
import { SESSION_COOKIE_NAME, verifySessionToken } from './lib/auth';
import { getDb, writePanelLog } from './lib/db';
import { getClientIp, isIpAllowed } from './lib/security';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      result[k] = decodeURIComponent(v);
    }
  }
  return result;
}

interface PtyLike {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number | null) => void) => void;
}

function createTerminalSession(cols: number, rows: number): PtyLike {
  // 1. Coba gunakan node-pty jika terpasang di server produksi
  try {
    const nodePty = require('node-pty') as {
      spawn: (
        file: string,
        args: string[],
        opts: {
          name: string;
          cols: number;
          rows: number;
          cwd: string;
          env: NodeJS.ProcessEnv;
        }
      ) => {
        write: (d: string) => void;
        resize: (c: number, r: number) => void;
        kill: () => void;
        onData: (cb: (d: string) => void) => void;
        onExit: (cb: (e: { exitCode: number }) => void) => void;
      };
    };

    const shell = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    const ptyProc = nodePty.spawn(shell, ['-i'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    return {
      write: (d) => ptyProc.write(d),
      resize: (c, r) => ptyProc.resize(c, r),
      kill: () => ptyProc.kill(),
      onData: (cb) => ptyProc.onData(cb),
      onExit: (cb) => ptyProc.onExit((e) => cb(e.exitCode)),
    };
  } catch {
    // 2. Fallback ringan tanpa dependensi native C++ menggunakan util-linux `script` atau bash
    const shell = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    const hasScript = fs.existsSync('/usr/bin/script');

    const child = hasScript
      ? spawn('/usr/bin/script', ['-qfc', `${shell} -i`, '/dev/null'], {
          cwd: process.env.HOME || process.cwd(),
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLUMNS: String(cols),
            LINES: String(rows),
          },
        })
      : spawn(shell, ['-i'], {
          cwd: process.env.HOME || process.cwd(),
          env: { ...process.env, TERM: 'xterm-256color' },
        });

    return {
      write: (d) => {
        if (!child.killed && child.stdin.writable) {
          child.stdin.write(d);
        }
      },
      resize: () => {
        // Fallback non-node-pty tidak mendukung ioctl TIOCSWINSZ langsung
      },
      kill: () => {
        if (!child.killed) {
          child.kill('SIGTERM');
        }
      },
      onData: (cb) => {
        child.stdout.on('data', (chunk: Buffer) => cb(chunk.toString('utf8')));
        child.stderr.on('data', (chunk: Buffer) => cb(chunk.toString('utf8')));
      },
      onExit: (cb) => {
        child.on('exit', (code) => cb(code));
      },
    };
  }
}

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  // Pastikan SQLite terinisialisasi saat boot
  getDb();

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket, username: string, ip: string) => {
    const pty = createTerminalSession(100, 30);

    pty.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    });

    pty.onExit((code) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'output',
            data: `\r\n\x1b[33m[Sesi terminal berakhir dengan kode ${code ?? 0}]\x1b[0m\r\n`,
          })
        );
        ws.close();
      }
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          cols?: number;
          rows?: number;
        };
        if (msg.type === 'input' && typeof msg.data === 'string') {
          pty.write(msg.data);
        } else if (
          msg.type === 'resize' &&
          typeof msg.cols === 'number' &&
          typeof msg.rows === 'number'
        ) {
          pty.resize(
            Math.min(Math.max(20, msg.cols), 300),
            Math.min(Math.max(10, msg.rows), 120)
          );
        }
      } catch {
        // Abaikan payload malformed
      }
    });

    ws.on('close', () => {
      pty.kill();
      writePanelLog('INFO', `Terminal session closed by ${username} (${ip})`);
    });
  });

  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  });

  server.on('upgrade', async (req, socket, head) => {
    const parsedUrl = parse(req.url || '/', true);
    if (parsedUrl.pathname !== '/ws/terminal') {
      // Abaikan WebSocket non-terminal agar tidak memicu crash pada upgrade HMR
      socket.destroy();
      return;
    }

    try {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE_NAME];
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const session = await verifySessionToken(token);
      if (!session) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const db = getDb();
      const ip = getClientIp(req as unknown as Request);
      const whitelist = db
        .prepare("SELECT value FROM settings WHERE key = 'ip_whitelist'")
        .get() as { value: string } | undefined;
      if (whitelist && !isIpAllowed(ip, whitelist.value)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      const userRow = db
        .prepare('SELECT id, username, role, is_active FROM users WHERE id = ?')
        .get(session.userId) as
        | { id: number; username: string; role: string; is_active: number }
        | undefined;

      // Web Terminal hanya untuk admin aktif
      if (!userRow || userRow.is_active !== 1 || userRow.role !== 'admin') {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      db.prepare(
        `INSERT INTO audit_logs (user_id, username, action, target, status, detail, ip_address)
         VALUES (?, ?, 'TERMINAL_OPEN', '/ws/terminal', 'success', 'Sesi Web Terminal dibuka', ?)`
      ).run(userRow.id, userRow.username, ip);

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, userRow.username, ip);
      });
    } catch {
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    writePanelLog('INFO', `RackLite Server listening on http://${hostname}:${port}`);
    console.log(`> RackLite Panel siap di http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error('Gagal memulai RackLite Server:', err);
  process.exit(1);
});
