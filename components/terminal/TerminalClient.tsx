'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { Card } from '@/components/ui/Card';

export function TerminalClient() {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<{ clear: () => void; dispose: () => void } | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>(
    'connecting'
  );
  const [sessionKey, setSessionKey] = useState(0);

  const connect = useCallback(async () => {
    if (!containerRef.current) return;
    setStatus('connecting');

    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);

    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'var(--font-jetbrains), monospace',
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      ws.send(
        JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        })
      );
      term.focus();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: string; data?: string };
        if (msg.type === 'output' && typeof msg.data === 'string') {
          term.write(msg.data);
        }
      } catch {
        // Abaikan pesan malformed
      }
    };

    ws.onclose = () => {
      setStatus('closed');
      term.writeln('\r\n\x1b[33m[Koneksi WebSocket terputus]\x1b[0m');
    };

    ws.onerror = () => {
      setStatus('closed');
    };

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const onResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            cols: term.cols,
            rows: term.rows,
          })
        );
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      dataDisposable.dispose();
      ws.close();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;
    connect().then((fn) => {
      if (active) cleanup = fn;
      else fn?.();
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [connect, sessionKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Web Terminal
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Sesi shell interaktif terenkripsi (khusus administrator)</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                status === 'connected'
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : status === 'connecting'
                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                    : 'text-red-600 dark:text-red-400 font-medium'
              }
            >
              {status === 'connected'
                ? 'Terhubung'
                : status === 'connecting'
                  ? 'Menghubungkan...'
                  : 'Terputus'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => termRef.current?.clear()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Bersihkan</span>
          </button>
          <button
            type="button"
            onClick={() => setSessionKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Hubungkan Ulang</span>
          </button>
        </div>
      </div>

      <Card noPadding className="overflow-hidden bg-slate-950 border-slate-800">
        <div ref={containerRef} className="h-[540px] w-full p-2" />
      </Card>
    </div>
  );
}
