'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Database, Download, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { usePanel } from '@/components/layout/Providers';
import type { DatabaseRecord } from '@/types/panel';

export function DatabasesClient() {
  const { notify } = usePanel();
  const [databases, setDatabases] = useState<DatabaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [engine, setEngine] = useState<'mariadb' | 'postgres'>('mariadb');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [password, setPassword] = useState('');
  const [privilege, setPrivilege] = useState<
    'ALL PRIVILEGES' | 'SELECT, INSERT, UPDATE, DELETE' | 'SELECT'
  >('ALL PRIVILEGES');

  const [deleteTarget, setDeleteTarget] = useState<DatabaseRecord | null>(null);

  const loadDbs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/databases');
      const data = (await res.json()) as { databases?: DatabaseRecord[]; error?: string };
      if (!res.ok) notify('error', data.error || 'Gagal memuat daftar database.');
      else setDatabases(data.databases || []);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDbs();
    });
  }, [loadDbs]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine, dbName, dbUser, password, privilege }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal membuat database.');
    else {
      notify('success', data.message || 'Database dibuat.');
      setCreateOpen(false);
      setDbName('');
      setDbUser('');
      setPassword('');
      loadDbs();
    }
  }

  async function handleDump(rec: DatabaseRecord) {
    const res = await fetch('/api/databases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rec.id }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Backup SQL gagal.');
    else notify('success', data.message || 'Dump SQL berhasil disimpan.');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/databases?id=${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menghapus database.');
    else {
      notify('success', data.message || 'Database dihapus.');
      setDeleteTarget(null);
      loadDbs();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Database Manager
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola database, user, hak akses, dan dump SQL untuk MariaDB/MySQL & PostgreSQL
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Database</span>
        </button>
      </div>

      <Card noPadding>
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            data={databases}
            rowKey={(d) => d.id}
            emptyState={
              <EmptyState
                icon={Database}
                title="Belum ada database"
                description="Buat database MariaDB atau PostgreSQL baru beserta akun penggunanya."
              />
            }
            columns={[
              {
                key: 'db_name',
                header: 'Nama Database',
                render: (d) => (
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {d.db_name}
                  </span>
                ),
              },
              {
                key: 'engine',
                header: 'Engine',
                render: (d) => (
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {d.engine === 'mariadb' ? 'MariaDB / MySQL' : 'PostgreSQL'}
                  </span>
                ),
              },
              {
                key: 'user',
                header: 'User & Hak Akses',
                render: (d) => (
                  <span className="font-mono text-xs text-slate-500">
                    {d.db_user} · {d.privilege}
                  </span>
                ),
              },
              {
                key: 'created',
                header: 'Dibuat',
                render: (d) => (
                  <span className="font-mono text-xs text-slate-500">
                    {d.created_at}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Aksi',
                align: 'right',
                render: (d) => (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDump(d)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Download className="w-3 h-3" />
                      <span>Dump SQL</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(d)}
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
        title="Buat Database Baru"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Engine</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as 'mariadb' | 'postgres')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="mariadb">MariaDB / MySQL</option>
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
              placeholder="app_production"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Username DB</label>
            <input
              type="text"
              required
              value={dbUser}
              onChange={(e) => setDbUser(e.target.value)}
              placeholder="app_user"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Kata Sandi User DB (min. 8 karakter)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Hak Akses</label>
            <select
              value={privilege}
              onChange={(e) =>
                setPrivilege(
                  e.target.value as
                    | 'ALL PRIVILEGES'
                    | 'SELECT, INSERT, UPDATE, DELETE'
                    | 'SELECT'
                )
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="ALL PRIVILEGES">ALL PRIVILEGES</option>
              <option value="SELECT, INSERT, UPDATE, DELETE">Read & Write</option>
              <option value="SELECT">Read Only (SELECT)</option>
            </select>
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
              Buat Database
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Database"
        description={`Hapus database "${deleteTarget?.db_name}" beserta user terkait? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Database"
      />
    </div>
  );
}
