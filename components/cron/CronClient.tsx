'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { usePanel } from '@/components/layout/Providers';
import { describeCronExpression, validateCronExpression } from '@/lib/cron-utils';
import type { CronJobRecord } from '@/types/panel';

export function CronClient() {
  const { notify } = usePanel();
  const [jobs, setJobs] = useState<CronJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [linuxUser, setLinuxUser] = useState('root');
  const [schedule, setSchedule] = useState('0 2 * * *');
  const [command, setCommand] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<CronJobRecord | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cron');
      const data = (await res.json()) as { jobs?: CronJobRecord[] };
      setJobs(data.jobs || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadJobs();
    });
  }, [loadJobs]);

  const scheduleCheck = validateCronExpression(schedule);

  function openNew() {
    setEditingId(null);
    setLinuxUser('root');
    setSchedule('0 2 * * *');
    setCommand('');
    setDescription('');
    setEnabled(true);
    setModalOpen(true);
  }

  function openEdit(job: CronJobRecord) {
    setEditingId(job.id);
    setLinuxUser(job.linux_user);
    setSchedule(job.schedule);
    setCommand(job.command);
    setDescription(job.description);
    setEnabled(job.enabled === 1);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/cron', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId ?? undefined,
        linuxUser,
        schedule,
        command,
        description,
        enabled,
      }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menyimpan cron job.');
    else {
      notify('success', data.message || 'Cron job disimpan.');
      setModalOpen(false);
      loadJobs();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/cron?id=${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menghapus cron job.');
    else {
      notify('success', data.message || 'Cron job dihapus.');
      setDeleteTarget(null);
      loadJobs();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Cron Manager
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Penjadwalan tugas otomatis per user Linux dengan validasi ekspresi cron
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Cron Job</span>
        </button>
      </div>

      <Card noPadding>
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            data={jobs}
            rowKey={(j) => j.id}
            emptyState={
              <EmptyState
                icon={Clock}
                title="Belum ada cron job"
                description="Tambahkan tugas terjadwal seperti rotasi log, renew SSL, atau skrip backup."
              />
            }
            columns={[
              {
                key: 'schedule',
                header: 'Jadwal',
                render: (j) => (
                  <div>
                    <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {j.schedule}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {describeCronExpression(j.schedule)}
                    </div>
                  </div>
                ),
              },
              {
                key: 'user',
                header: 'User',
                render: (j) => <span className="font-mono text-xs">{j.linux_user}</span>,
              },
              {
                key: 'command',
                header: 'Perintah',
                render: (j) => (
                  <div>
                    <div className="font-mono text-xs text-slate-700 dark:text-slate-200 truncate max-w-[320px]">
                      {j.command}
                    </div>
                    {j.description && (
                      <div className="text-[11px] text-slate-500">{j.description}</div>
                    )}
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (j) => (
                  <span
                    className={`text-xs font-medium ${
                      j.enabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {j.enabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Aksi',
                align: 'right',
                render: (j) => (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(j)}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(j)}
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Cron Job' : 'Tambah Cron Job'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">User Linux</label>
              <input
                type="text"
                required
                value={linuxUser}
                onChange={(e) => setLinuxUser(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Ekspresi Cron</label>
              <input
                type="text"
                required
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="0 2 * * *"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          </div>

          <div
            className={`text-xs ${
              scheduleCheck.valid
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {scheduleCheck.valid
              ? describeCronExpression(schedule)
              : scheduleCheck.reason}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Perintah</label>
            <input
              type="text"
              required
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="/usr/bin/certbot renew --quiet"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Keterangan</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pembaruan sertifikat SSL otomatis"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Aktifkan cron job ini</span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!scheduleCheck.valid}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white disabled:opacity-50"
            >
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Cron Job"
        description={`Hapus jadwal "${deleteTarget?.schedule}" untuk user "${deleteTarget?.linux_user}"?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}
