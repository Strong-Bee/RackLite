'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { usePanel } from '@/components/layout/Providers';
import type { BackupRecord } from '@/types/panel';

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

export function BackupsClient() {
  const { notify } = usePanel();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [name, setName] = useState('site-backup');
  const [backupType, setBackupType] = useState<'files' | 'database' | 'full'>('files');
  const [target, setTarget] = useState<'local' | 's3'>('local');
  const [sourcePath, setSourcePath] = useState('./data/workspace');
  const [dbEngine, setDbEngine] = useState<'mariadb' | 'postgres'>('mariadb');
  const [dbName, setDbName] = useState('');
  const [scheduleCron, setScheduleCron] = useState('');

  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [restoreDest, setRestoreDest] = useState('./data/workspace');
  const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backups');
      const data = (await res.json()) as { backups?: BackupRecord[] };
      setBackups(data.backups || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadBackups();
    });
  }, [loadBackups]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/backups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        backupType,
        target,
        sourcePath,
        dbEngine: backupType === 'database' ? dbEngine : undefined,
        dbName: backupType === 'database' ? dbName : undefined,
        scheduleCron: scheduleCron.trim() || undefined,
      }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Backup gagal dibuat.');
    else {
      notify('success', data.message || 'Backup selesai.');
      setCreateOpen(false);
      loadBackups();
    }
  }

  async function handleRestore(e: React.FormEvent) {
    e.preventDefault();
    if (!restoreTarget) return;
    const res = await fetch('/api/backups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: restoreTarget.id,
        destinationDir: restoreDest,
      }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Restore gagal.');
    else {
      notify('success', data.message || 'Restore berhasil.');
      setRestoreTarget(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/backups?id=${deleteTarget.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) notify('error', 'Gagal menghapus backup.');
    else {
      notify('success', 'Backup dihapus.');
      setDeleteTarget(null);
      loadBackups();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Backup & Restore
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Backup berkas dan database ke penyimpanan lokal atau S3-compatible
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Backup</span>
        </button>
      </div>

      <Card noPadding>
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            data={backups}
            rowKey={(b) => b.id}
            emptyState={
              <EmptyState
                icon={Archive}
                title="Belum ada arsip backup"
                description="Buat backup manual atau jadwalkan snapshot berkas & database Anda."
              />
            }
            columns={[
              {
                key: 'name',
                header: 'Nama Backup',
                render: (b) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {b.name}
                    </div>
                    <div className="text-xs font-mono text-slate-500 truncate max-w-[260px]">
                      {b.source_path}
                    </div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Tipe · Target',
                render: (b) => (
                  <span className="text-xs font-mono">
                    {b.backup_type} · {b.target.toUpperCase()}
                  </span>
                ),
              },
              {
                key: 'size',
                header: 'Ukuran',
                align: 'right',
                render: (b) => (
                  <span className="font-mono text-xs">
                    {formatBytes(b.size_bytes)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (b) => (
                  <span
                    className={`text-xs font-medium ${
                      b.status === 'completed'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {b.status}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Aksi',
                align: 'right',
                render: (b) => (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRestoreTarget(b)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(b)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat Backup Baru"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Nama Backup</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tipe</label>
              <select
                value={backupType}
                onChange={(e) =>
                  setBackupType(e.target.value as 'files' | 'database' | 'full')
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="files">Berkas / Direktori</option>
                <option value="database">Database SQL</option>
                <option value="full">Snapshot Penuh</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tujuan</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as 'local' | 's3')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="local">Lokal (./data/backups)</option>
                <option value="s3">S3-Compatible Object Storage</option>
              </select>
            </div>
          </div>

          {backupType === 'database' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Engine DB</label>
                <select
                  value={dbEngine}
                  onChange={(e) =>
                    setDbEngine(e.target.value as 'mariadb' | 'postgres')
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="mariadb">MariaDB</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Nama Database</label>
                <input
                  type="text"
                  required
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium mb-1">
                Path Sumber (dalam root yang diizinkan)
              </label>
              <input
                type="text"
                required
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">
              Jadwal Cron (opsional)
            </label>
            <input
              type="text"
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              placeholder="0 3 * * *"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
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
              Jalankan Backup
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        title="Restore Arsip Backup"
        subtitle={restoreTarget?.name}
        maxWidth="sm"
      >
        <form onSubmit={handleRestore} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Direktori Tujuan Ekstraksi
            </label>
            <input
              type="text"
              required
              value={restoreDest}
              onChange={(e) => setRestoreDest(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRestoreTarget(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white"
            >
              Restore Sekarang
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Backup"
        description={`Hapus arsip backup "${deleteTarget?.name}" dari disk lokal?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}
