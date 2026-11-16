'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { AuditLogRecord } from '@/types/panel';

export function AuditClient() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '150', q: query });
      const res = await fetch(`/api/audit?${qs.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { logs?: AuditLogRecord[] };
        setLogs(data.logs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAudit();
    });
  }, [loadAudit]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Audit Log
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Catatan seluruh aktivitas kritis: siapa, kapan, aksi, target, dan alamat IP
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari user, aksi, IP..."
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-56"
          />
          <button
            type="button"
            onClick={loadAudit}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            data={logs}
            rowKey={(l) => l.id}
            emptyState={
              <EmptyState
                icon={ScrollText}
                title="Belum ada catatan audit"
                description="Semua aksi login, file manager, terminal, dan sistem akan tercatat di sini."
              />
            }
            columns={[
              {
                key: 'time',
                header: 'Waktu (UTC)',
                render: (l) => (
                  <span className="font-mono text-xs text-slate-500 whitespace-nowrap">
                    {l.created_at}
                  </span>
                ),
              },
              {
                key: 'user',
                header: 'Pengguna',
                render: (l) => (
                  <span className="text-xs font-medium">{l.username}</span>
                ),
              },
              {
                key: 'action',
                header: 'Aksi',
                render: (l) => (
                  <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {l.action}
                  </span>
                ),
              },
              {
                key: 'target',
                header: 'Target & Detail',
                render: (l) => (
                  <div>
                    <div className="font-mono text-xs truncate max-w-[260px]">
                      {l.target}
                    </div>
                    {l.detail && (
                      <div className="text-[11px] text-slate-500 truncate max-w-[260px]">
                        {l.detail}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (l) => (
                  <span
                    className={`text-xs font-medium ${
                      l.status === 'success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : l.status === 'denied'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {l.status}
                  </span>
                ),
              },
              {
                key: 'ip',
                header: 'IP',
                align: 'right',
                render: (l) => (
                  <span className="font-mono text-xs text-slate-500">
                    {l.ip_address}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
