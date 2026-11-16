'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Shield, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { usePanel } from '@/components/layout/Providers';
import type { FirewallRuleRecord, OpenPortInfo } from '@/types/panel';

export function FirewallClient() {
  const { notify } = usePanel();
  const [rules, setRules] = useState<FirewallRuleRecord[]>([]);
  const [openPorts, setOpenPorts] = useState<OpenPortInfo[]>([]);
  const [ufwStatus, setUfwStatus] = useState<{
    available: boolean;
    active: boolean;
    rawOutput: string;
  }>({ available: false, active: false, rawOutput: '' });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [port, setPort] = useState('80');
  const [protocol, setProtocol] = useState<'tcp' | 'udp' | 'any'>('tcp');
  const [action, setAction] = useState<'allow' | 'deny'>('allow');
  const [sourceIp, setSourceIp] = useState('any');
  const [comment, setComment] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<FirewallRuleRecord | null>(null);

  const loadFirewall = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/firewall');
      const data = (await res.json()) as {
        rules?: FirewallRuleRecord[];
        openPorts?: OpenPortInfo[];
        ufw?: { available: boolean; active: boolean; rawOutput: string };
      };
      setRules(data.rules || []);
      setOpenPorts(data.openPorts || []);
      if (data.ufw) setUfwStatus(data.ufw);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadFirewall();
    });
  }, [loadFirewall]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/firewall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, protocol, action, sourceIp, comment }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menambah aturan.');
    else {
      notify('success', data.message || 'Aturan firewall ditambahkan.');
      setCreateOpen(false);
      loadFirewall();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/firewall?id=${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menghapus aturan.');
    else {
      notify('success', data.message || 'Aturan dihapus.');
      setDeleteTarget(null);
      loadFirewall();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Firewall (UFW) & Port Terbuka
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Status UFW:</span>
            <span
              className={
                ufwStatus.active
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'text-amber-600 dark:text-amber-400 font-medium'
              }
            >
              {ufwStatus.available
                ? ufwStatus.active
                  ? 'Aktif'
                  : 'Terpasang (Nonaktif)'
                : 'Belum terpasang (kebijakan tersimpan di panel)'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Aturan</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7">
          <Card title="Aturan Firewall" noPadding>
            {loading ? (
              <TableSkeleton />
            ) : (
              <DataTable
                data={rules}
                rowKey={(r) => r.id}
                emptyState={
                  <EmptyState
                    icon={Shield}
                    title="Belum ada aturan firewall"
                    description="Tambahkan aturan allow/deny untuk port SSH, HTTP, HTTPS, atau database."
                  />
                }
                columns={[
                  {
                    key: 'port',
                    header: 'Port / Proto',
                    render: (r) => (
                      <span className="font-mono text-xs font-semibold">
                        {r.port}/{r.protocol}
                      </span>
                    ),
                  },
                  {
                    key: 'action',
                    header: 'Aksi',
                    render: (r) => (
                      <span
                        className={`text-xs font-semibold ${
                          r.action === 'allow'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {r.action.toUpperCase()}
                      </span>
                    ),
                  },
                  {
                    key: 'source',
                    header: 'Sumber IP',
                    render: (r) => (
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {r.source_ip}
                      </span>
                    ),
                  },
                  {
                    key: 'comment',
                    header: 'Catatan',
                    render: (r) => (
                      <span className="text-xs text-slate-500">
                        {r.comment || '-'}
                      </span>
                    ),
                  },
                  {
                    key: 'del',
                    header: '',
                    align: 'right',
                    render: (r) => (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(r)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </div>

        <div className="xl:col-span-5">
          <Card
            title="Port Listening Saat Ini"
            subtitle="Dideteksi langsung melalui ss -tulnp"
            noPadding
          >
            <DataTable
              data={openPorts}
              rowKey={(p, ) => `${p.protocol}-${p.localAddress}-${p.port}-${p.process}`}
              emptyState={
                <EmptyState
                  icon={Shield}
                  title="Tidak ada port listening terdeteksi"
                  description="Perintah ss tidak mengembalikan soket terbuka."
                />
              }
              columns={[
                {
                  key: 'proto',
                  header: 'Proto',
                  render: (p) => <span className="font-mono text-xs">{p.protocol}</span>,
                },
                {
                  key: 'addr',
                  header: 'Alamat : Port',
                  render: (p) => (
                    <span className="font-mono text-xs">
                      {p.localAddress}:{p.port}
                    </span>
                  ),
                },
                {
                  key: 'proc',
                  header: 'Proses',
                  render: (p) => (
                    <span className="font-mono text-xs text-slate-500">
                      {p.process}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tambah Aturan Firewall UFW"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Port / Rentang</label>
              <input
                type="text"
                required
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="443 atau 8000:8010"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Protokol</label>
              <select
                value={protocol}
                onChange={(e) =>
                  setProtocol(e.target.value as 'tcp' | 'udp' | 'any')
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="any">TCP & UDP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tindakan</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as 'allow' | 'deny')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="allow">ALLOW (Izinkan)</option>
                <option value="deny">DENY (Blokir)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Sumber IP/CIDR</label>
              <input
                type="text"
                required
                value={sourceIp}
                onChange={(e) => setSourceIp(e.target.value)}
                placeholder="any atau 10.0.0.0/24"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Catatan</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="HTTPS Web Traffic"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white"
            >
              Terapkan Aturan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Aturan Firewall"
        description={`Hapus aturan ${deleteTarget?.action.toUpperCase()} port ${deleteTarget?.port}/${deleteTarget?.protocol}?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}
