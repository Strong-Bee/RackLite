'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { MetricChart } from '@/components/dashboard/MetricChart';
import { usePanel } from '@/components/layout/Providers';
import type { SystemMetrics } from '@/types/panel';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}h ${hours}j ${mins}m`;
  if (hours > 0) return `${hours}j ${mins}m`;
  return `${mins}m ${sec % 60}d`;
}

export function DashboardClient({
  initialMetrics,
}: {
  initialMetrics: SystemMetrics;
}) {
  const { t } = usePanel();
  const [metrics, setMetrics] = useState<SystemMetrics>(initialMetrics);
  const [cpuHistory, setCpuHistory] = useState<number[]>([
    initialMetrics.cpu.usagePercent,
  ]);
  const [ramHistory, setRamHistory] = useState<number[]>([
    initialMetrics.memory.usagePercent,
  ]);
  const [rxHistory, setRxHistory] = useState<number[]>([
    initialMetrics.network.rxBytesPerSec / 1024,
  ]);
  const [txHistory, setTxHistory] = useState<number[]>([
    initialMetrics.network.txBytesPerSec / 1024,
  ]);
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const pushMetrics = (m: SystemMetrics) => {
      setMetrics(m);
      setCpuHistory((prev) => [...prev.slice(-29), m.cpu.usagePercent]);
      setRamHistory((prev) => [...prev.slice(-29), m.memory.usagePercent]);
      setRxHistory((prev) => [
        ...prev.slice(-29),
        Math.round((m.network.rxBytesPerSec / 1024) * 10) / 10,
      ]);
      setTxHistory((prev) => [
        ...prev.slice(-29),
        Math.round((m.network.txBytesPerSec / 1024) * 10) / 10,
      ]);
    };

    try {
      es = new EventSource('/api/metrics/stream');
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as SystemMetrics;
          pushMetrics(parsed);
          setStreaming(true);
        } catch {
          // Abaikan payload malformed
        }
      };
      es.onerror = () => {
        setStreaming(false);
        es?.close();
        if (!pollTimer) {
          pollTimer = setInterval(async () => {
            try {
              const res = await fetch('/api/metrics');
              if (res.ok) {
                pushMetrics((await res.json()) as SystemMetrics);
              }
            } catch {
              // Abaikan error sementara
            }
          }, 4000);
        }
      };
    } catch {
      queueMicrotask(() => setStreaming(false));
    }

    return () => {
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  async function manualRefresh() {
    const res = await fetch('/api/metrics');
    if (res.ok) {
      const m = (await res.json()) as SystemMetrics;
      setMetrics(m);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header ringkas & metadata host tanpa pill clutter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t.dashboard.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {metrics.hostname}
            </span>
            <span aria-hidden="true">·</span>
            <span>{metrics.platform}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Kernel {metrics.kernel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {t.dashboard.panelRam}: {metrics.panelRssMb} MB
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {streaming ? 'SSE Realtime (3s)' : 'Polling (4s)'}
          </span>
          <button
            type="button"
            onClick={manualRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.common.refresh}</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.dashboard.cpu}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {metrics.cpu.usagePercent.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {metrics.cpu.cores} vCPU
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${Math.min(100, metrics.cpu.usagePercent)}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Load: {metrics.cpu.loadAvg.join(' / ')}
          </div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.dashboard.memory}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {metrics.memory.usagePercent.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {formatBytes(metrics.memory.usedBytes)} /{' '}
              {formatBytes(metrics.memory.totalBytes)}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, metrics.memory.usagePercent)}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {t.dashboard.swap}: {formatBytes(metrics.memory.swapUsedBytes)} /{' '}
            {formatBytes(metrics.memory.swapTotalBytes)}
          </div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.dashboard.network}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatBytes(metrics.network.rxBytesPerSec)}/s
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              RX (Masuk)
            </span>
          </div>
          <div className="mt-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            TX (Keluar): {formatBytes(metrics.network.txBytesPerSec)}/s
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Total: {formatBytes(metrics.network.totalRxBytes)} RX ·{' '}
            {formatBytes(metrics.network.totalTxBytes)} TX
          </div>
        </Card>

        <Card>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t.dashboard.uptime}
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatUptime(metrics.uptimeSeconds)}
          </div>
          <div className="mt-3 text-xs text-slate-600 dark:text-slate-300 truncate">
            {metrics.cpu.model}
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {metrics.disks[0]
              ? `Root (/): ${metrics.disks[0].usagePercent}% (${formatBytes(metrics.disks[0].availableBytes)} bebas)`
              : 'Disk tersedia'}
          </div>
        </Card>
      </div>

      {/* Grafik Realtime */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Grafik CPU & RAM Realtime"
          subtitle="Riwayat 90 detik terakhir"
        >
          <MetricChart
            maxValue={100}
            unit="%"
            series={[
              { label: 'CPU', color: '#0284c7', data: cpuHistory },
              { label: 'RAM', color: '#16a34a', data: ramHistory },
            ]}
          />
        </Card>

        <Card
          title="Lalu Lintas Jaringan Realtime"
          subtitle="Kecepatan transfer dalam KB/s"
        >
          <MetricChart
            unit=" KB/s"
            series={[
              { label: 'RX', color: '#0284c7', data: rxHistory },
              { label: 'TX', color: '#d97706', data: txHistory },
            ]}
          />
        </Card>
      </div>

      {/* Disk & Top Processes */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-5">
          <Card title={t.dashboard.disk} noPadding>
            <DataTable
              data={metrics.disks}
              rowKey={(d) => `${d.filesystem}-${d.mount}`}
              columns={[
                {
                  key: 'mount',
                  header: 'Mount',
                  render: (d) => (
                    <span className="font-mono text-xs font-medium">{d.mount}</span>
                  ),
                },
                {
                  key: 'used',
                  header: 'Terpakai',
                  align: 'right',
                  render: (d) => (
                    <span className="font-mono text-xs">
                      {formatBytes(d.usedBytes)} / {formatBytes(d.totalBytes)}
                    </span>
                  ),
                },
                {
                  key: 'pct',
                  header: '%',
                  align: 'right',
                  render: (d) => (
                    <span
                      className={`font-mono text-xs font-medium ${
                        d.usagePercent > 85
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {d.usagePercent.toFixed(1)}%
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        </div>

        <div className="xl:col-span-7">
          <Card title={t.dashboard.processes} noPadding>
            <DataTable
              data={metrics.processes}
              rowKey={(p) => p.pid}
              columns={[
                {
                  key: 'pid',
                  header: 'PID',
                  render: (p) => (
                    <span className="font-mono text-xs tabular-nums">{p.pid}</span>
                  ),
                },
                {
                  key: 'user',
                  header: 'User',
                  render: (p) => <span className="text-xs">{p.user}</span>,
                },
                {
                  key: 'cmd',
                  header: 'Perintah',
                  render: (p) => (
                    <span className="font-mono text-xs truncate max-w-[180px] inline-block">
                      {p.command}
                    </span>
                  ),
                },
                {
                  key: 'cpu',
                  header: 'CPU',
                  align: 'right',
                  render: (p) => (
                    <span className="font-mono text-xs">{p.cpu.toFixed(1)}%</span>
                  ),
                },
                {
                  key: 'mem',
                  header: 'RAM',
                  align: 'right',
                  render: (p) => (
                    <span className="font-mono text-xs">{p.mem.toFixed(1)}%</span>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
