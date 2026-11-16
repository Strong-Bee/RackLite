'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Play, RefreshCw, RotateCw, Square } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { usePanel } from '@/components/layout/Providers';
import type { ServiceStatus } from '@/types/panel';

export function ServicesClient() {
  const { notify } = usePanel();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [systemdAvailable, setSystemdAvailable] = useState(true);
  const [loading, setLoading] = useState(true);

  const [logModal, setLogModal] = useState<{
    name: string;
    logs: string;
  } | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/services');
      const data = (await res.json()) as {
        systemdAvailable?: boolean;
        services?: ServiceStatus[];
      };
      setSystemdAvailable(data.systemdAvailable ?? false);
      setServices(data.services || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadServices();
    });
  }, [loadServices]);

  async function runAction(
    name: string,
    action: 'start' | 'stop' | 'restart' | 'enable' | 'disable'
  ) {
    const res = await fetch('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, action }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Aksi service gagal.');
    else {
      notify('success', data.message || `Service ${name}: ${action} selesai.`);
      loadServices();
    }
  }

  async function viewLogs(name: string) {
    const res = await fetch(`/api/services?logs=${encodeURIComponent(name)}`);
    const data = (await res.json()) as { logs?: string };
    setLogModal({ name, logs: data.logs || '(Tidak ada log)' });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Service Manager (systemd)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {systemdAvailable
              ? 'Kontrol daemon sistem melalui systemctl dan inspeksi log journalctl'
              : 'Systemd tidak aktif di container saat ini; tampilan status membaca unit terkelola'}
          </p>
        </div>
        <button
          type="button"
          onClick={loadServices}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>

      <Card noPadding>
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            data={services}
            rowKey={(s) => s.name}
            columns={[
              {
                key: 'name',
                header: 'Service',
                render: (s) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {s.label}
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      {s.name} · {s.description}
                    </div>
                  </div>
                ),
              },
              {
                key: 'state',
                header: 'Status',
                render: (s) => (
                  <span
                    className={`text-xs font-medium ${
                      s.activeState === 'active'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : s.activeState === 'failed'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s.activeState === 'active'
                      ? 'Aktif (running)'
                      : s.activeState === 'failed'
                        ? 'Gagal (failed)'
                        : s.subState}
                  </span>
                ),
              },
              {
                key: 'enabled',
                header: 'Boot',
                render: (s) => (
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    {s.enabled ? 'enabled' : 'disabled'}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Kontrol',
                align: 'right',
                render: (s) => (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => runAction(s.name, 'start')}
                      className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      title="Start"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction(s.name, 'restart')}
                      className="p-1.5 rounded-md text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                      title="Restart"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction(s.name, 'stop')}
                      className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      title="Stop"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(s.name, s.enabled ? 'disable' : 'enable')
                      }
                      className="px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      {s.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => viewLogs(s.name)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Lihat journalctl"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={logModal !== null}
        onClose={() => setLogModal(null)}
        title={`Journalctl: ${logModal?.name}`}
        maxWidth="xl"
      >
        <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-96 whitespace-pre-wrap">
          {logModal?.logs}
        </pre>
      </Modal>
    </div>
  );
}
