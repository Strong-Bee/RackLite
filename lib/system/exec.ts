import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Whitelist biner sistem yang diizinkan dieksekusi oleh panel
const ALLOWED_BINARIES = new Set([
  'df',
  'ps',
  'ss',
  'uname',
  'chmod',
  'chown',
  'tar',
  'nginx',
  'certbot',
  'systemctl',
  'journalctl',
  'crontab',
  'ufw',
  'mysql',
  'mysqldump',
  'psql',
  'pg_dump',
  'which',
]);

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
  missingBinary?: boolean;
}

const binaryCache = new Map<string, string | null>();

/**
 * Cari lokasi biner sistem secara aman menggunakan daftar direktori standar.
 */
export async function findBinary(binary: string): Promise<string | null> {
  if (!ALLOWED_BINARIES.has(binary)) return null;
  if (binaryCache.has(binary)) return binaryCache.get(binary) ?? null;

  const searchDirs = [
    '/usr/local/sbin',
    '/usr/local/bin',
    '/usr/sbin',
    '/usr/bin',
    '/sbin',
    '/bin',
  ];
  for (const dir of searchDirs) {
    const candidate = `${dir}/${binary}`;
    try {
      await fs.access(candidate);
      binaryCache.set(binary, candidate);
      return candidate;
    } catch {
      // Lanjut cek direktori berikutnya
    }
  }
  binaryCache.set(binary, null);
  return null;
}

/**
 * Eksekusi perintah sistem secara aman menggunakan execFile (tanpa shell interpolation).
 */
export async function runSystemCommand(
  binary: string,
  args: string[],
  options?: { timeoutMs?: number; input?: string }
): Promise<ExecResult> {
  if (!ALLOWED_BINARIES.has(binary)) {
    return {
      ok: false,
      stdout: '',
      stderr: `Perintah "${binary}" tidak masuk whitelist keamanan.`,
      code: 126,
    };
  }

  const binPath = await findBinary(binary);
  if (!binPath) {
    return {
      ok: false,
      stdout: '',
      stderr: `Biner "${binary}" tidak terpasang di sistem ini.`,
      code: 127,
      missingBinary: true,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binPath, args, {
      timeout: options?.timeoutMs ?? 15000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        LANG: 'C.UTF-8',
      },
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };
    return {
      ok: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr || e.message || 'Eksekusi perintah gagal.',
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}
