'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Lock, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { usePanel } from '@/components/layout/Providers';
import type { WebsiteRecord } from '@/types/panel';

export function WebsitesClient() {
  const { notify } = usePanel();
  const [websites, setWebsites] = useState<WebsiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [domain, setDomain] = useState('');
  const [rootPath, setRootPath] = useState('/var/www/html');
  const [type, setType] = useState<'static' | 'php' | 'proxy'>('static');
  const [proxyPass, setProxyPass] = useState('http://127.0.0.1:4000');
  const [phpVersion, setPhpVersion] = useState('8.2');
  const [forceHttps, setForceHttps] = useState(true);

  const [sslTarget, setSslTarget] = useState<WebsiteRecord | null>(null);
  const [sslEmail, setSslEmail] = useState('');
  const [sslRedirect, setSslRedirect] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<WebsiteRecord | null>(null);

  const loadWebsites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/websites');
      const data = (await res.json()) as { websites?: WebsiteRecord[]; error?: string };
      if (!res.ok) notify('error', data.error || 'Gagal memuat daftar website.');
      else setWebsites(data.websites || []);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadWebsites();
    });
  }, [loadWebsites]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/websites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        rootPath,
        type,
        proxyPass: type === 'proxy' ? proxyPass : '',
        phpVersion: type === 'php' ? phpVersion : '',
        forceHttps,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
    if (!res.ok) {
      notify('error', data.error || 'Gagal membuat virtual host.');
    } else {
      notify('success', data.message || 'Virtual host dibuat.');
      setCreateOpen(false);
      setDomain('');
      loadWebsites();
    }
  }

  async function handleIssueSsl(e: React.FormEvent) {
    e.preventDefault();
    if (!sslTarget) return;
    const res = await fetch('/api/websites', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sslTarget.id,
        email: sslEmail,
        forceHttps: sslRedirect,
      }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) {
      notify('error', data.error || 'Gagal menerbitkan SSL.');
    } else {
      notify('success', data.message || 'SSL berhasil diaktifkan.');
      setSslTarget(null);
      loadWebsites();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/websites?id=${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menghapus website.');
    else {
      notify('success', data.message || 'Website dihapus.');
      setDeleteTarget(null);
      loadWebsites();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Website Manager (Nginx)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Virtual host Nginx, Reverse Proxy, PHP-FPM, dan SSL Let’s Encrypt
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Website</span>
        </button>
      </div>

      <Card noPadding>
        {loading ? (
          <TableSkeleton />
        ) : (
          <DataTable
            data={websites}
            rowKey={(w) => w.id}
            emptyState={
              <EmptyState
                icon={Globe}
                title="Belum ada virtual host"
                description="Tambahkan domain untuk membuat konfigurasi Nginx secara otomatis."
                action={
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white"
                  >
                    Tambah Website Pertama
                  </button>
                }
              />
            }
            columns={[
              {
                key: 'domain',
                header: 'Domain',
                render: (w) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {w.domain}
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      {w.type === 'proxy' ? w.proxy_pass : w.root_path}
                    </div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Mode',
                render: (w) => (
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                    {w.type === 'php'
                      ? `PHP-FPM ${w.php_version || '8.2'}`
                      : w.type === 'proxy'
                        ? 'Reverse Proxy'
                        : 'Static'}
                  </span>
                ),
              },
              {
                key: 'ssl',
                header: 'SSL / HTTPS',
                render: (w) => (
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      w.ssl_enabled
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {w.ssl_enabled
                        ? w.force_https
                          ? 'HTTPS Aktif (Redirect)'
                          : 'HTTPS Aktif'
                        : 'HTTP Saja'}
                    </span>
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Aksi',
                align: 'right',
                render: (w) => (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSslTarget(w);
                        setSslEmail('');
                      }}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      Pasang SSL
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(w)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      title="Hapus"
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
        title="Tambah Virtual Host Nginx"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Domain</label>
            <input
              type="text"
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.domainanda.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Tipe Aplikasi</label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as 'static' | 'php' | 'proxy')
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="static">Static HTML / SPA</option>
              <option value="php">PHP-FPM</option>
              <option value="proxy">Reverse Proxy (Node.js / Docker / Go)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Document Root</label>
            <input
              type="text"
              required
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          {type === 'proxy' && (
            <div>
              <label className="block text-xs font-medium mb-1">
                Target Reverse Proxy
              </label>
              <input
                type="text"
                required
                value={proxyPass}
                onChange={(e) => setProxyPass(e.target.value)}
                placeholder="http://127.0.0.1:4000"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          )}
          {type === 'php' && (
            <div>
              <label className="block text-xs font-medium mb-1">Versi PHP-FPM</label>
              <input
                type="text"
                required
                value={phpVersion}
                onChange={(e) => setPhpVersion(e.target.value)}
                placeholder="8.2"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={forceHttps}
              onChange={(e) => setForceHttps(e.target.checked)}
            />
            <span>Siapkan redirect HTTP ke HTTPS saat SSL aktif</span>
          </label>
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
              Simpan & Terapkan
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={sslTarget !== null}
        onClose={() => setSslTarget(null)}
        title="Terbitkan SSL Let’s Encrypt"
        subtitle={sslTarget?.domain}
        maxWidth="sm"
      >
        <form onSubmit={handleIssueSsl} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Email Pemberitahuan Certbot
            </label>
            <input
              type="email"
              required
              value={sslEmail}
              onChange={(e) => setSslEmail(e.target.value)}
              placeholder="admin@domainanda.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={sslRedirect}
              onChange={(e) => setSslRedirect(e.target.checked)}
            />
            <span>Paksa redirect HTTP ke HTTPS</span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSslTarget(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white"
            >
              Terbitkan SSL
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Virtual Host"
        description={`Hapus konfigurasi Nginx untuk "${deleteTarget?.domain}"?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}
