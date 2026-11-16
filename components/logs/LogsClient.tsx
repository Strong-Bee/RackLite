'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';

type LogSource = 'panel' | 'nginx-access' | 'nginx-error' | 'syslog';

export function LogsClient() {
  const [source, setSource] = useState<LogSource>('panel');
  const [filter, setFilter] = useState('');
  const [tailLive, setTailLive] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const [filePath, setFilePath] = useState('');
  const [message, setMessage] = useState('');

  const loadLogs = useCallback(async () => {
    const qs = new URLSearchParams({
      source,
      lines: '150',
      filter,
    });
    const res = await fetch(`/api/logs?${qs.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as {
        path: string;
        lines: string[];
        message?: string;
      };
      setFilePath(data.path);
      setLines(data.lines || []);
      setMessage(data.message || '');
    }
  }, [source, filter]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLogs();
    });
    if (!tailLive) return;
    const id = setInterval(loadLogs, 3000);
    return () => clearInterval(id);
  }, [loadLogs, tailLive]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Log Viewer
          </h1>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
            {filePath || 'Pilih sumber log untuk pemantauan realtime'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(
              [
                { id: 'panel', label: 'Panel' },
                { id: 'nginx-access', label: 'Nginx Access' },
                { id: 'nginx-error', label: 'Nginx Error' },
                { id: 'syslog', label: 'Syslog' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSource(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  source === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card noPadding>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter kata kunci (mis. ERROR, 500, LOGIN)..."
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 w-full sm:w-80"
          />
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={tailLive}
                onChange={(e) => setTailLive(e.target.checked)}
              />
              <span>Tail realtime (3d)</span>
            </label>
            <button
              type="button"
              onClick={loadLogs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-950 text-slate-200 p-4 font-mono text-xs leading-relaxed h-[500px] overflow-y-auto whitespace-pre-wrap">
          {message ? (
            <span className="text-amber-400">{message}</span>
          ) : lines.length === 0 ? (
            <span className="text-slate-500">(Belum ada baris log yang cocok)</span>
          ) : (
            lines.join('\n')
          )}
        </div>
      </Card>
    </div>
  );
}
