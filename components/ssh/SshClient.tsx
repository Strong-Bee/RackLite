'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Key, Trash2, Plus, Copy, Eye, EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { usePanel } from '@/components/layout/Providers';
import type { SshKey } from '@/types/panel';

export function SshClient() {
  const { t, notify } = usePanel();
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<SshKey | null>(null);
  const [showPrivate, setShowPrivate] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', publicKey: '', privateKey: '', passphrase: '' });

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ssh');
      const data = (await res.json()) as { keys?: SshKey[] };
      setKeys(data.keys || []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadKeys());
  }, [loadKeys]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isEdit = editingKey !== null;
    const url = isEdit ? `/api/ssh/${editingKey.id}` : '/api/ssh';
    const method = isEdit ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) notify('error', data.error || 'Gagal menyimpan');
      else {
        notify('success', data.message || (isEdit ? 'Kunci diperbarui' : 'Kunci ditambahkan'));
        setShowModal(false);
        setEditingKey(null);
        setFormData({ name: '', publicKey: '', privateKey: '', passphrase: '' });
        loadKeys();
      }
    } catch {
      notify('error', 'Terjadi kesalahan jaringan');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus kunci SSH ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
      const res = await fetch(`/api/ssh/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) notify('error', data.error || 'Gagal menghapus');
      else {
        notify('success', data.message || 'Kunci dihapus');
        loadKeys();
      }
    } catch {
      notify('error', 'Terjadi kesalahan jaringan');
    }
  }

  function openAddModal() {
    setEditingKey(null);
    setFormData({ name: '', publicKey: '', privateKey: '', passphrase: '' });
    setShowModal(true);
  }

  function openEditModal(key: SshKey) {
    setEditingKey(key);
    setFormData({ name: key.name, publicKey: key.publicKey, privateKey: key.privateKey || '', passphrase: '' });
    setShowModal(true);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    notify('success', 'Disalin ke clipboard');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">SSH Keys</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola kunci SSH untuk akses server, Git, dan deployment
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={loadKeys} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang</span>
          </button>
          <button type="button" onClick={openAddModal} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 whitespace-nowrap">
            <Plus className="w-4 h-4" />
            <span>Tambah Kunci</span>
          </button>
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Memuat kunci SSH...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <Key className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Belum ada kunci SSH</p>
            <button type="button" onClick={openAddModal} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700">
              <Plus className="w-4 h-4" />
              <span>Tambah Kunci Pertama</span>
            </button>
          </div>
        ) : (
          <DataTable
            data={keys}
            rowKey={(k) => k.id}
            columns={[
              {
                key: 'name',
                header: 'Nama',
                render: (k) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{k.name}</div>
                    <div className="text-xs font-mono text-slate-500">{k.fingerprint}</div>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Tipe',
                render: (k) => (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {k.type.toUpperCase()}
                  </span>
                ),
              },
              {
                key: 'createdAt',
                header: 'Dibuat',
                render: (k) => new Date(k.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }),
              },
              {
                key: 'actions',
                header: 'Aksi',
                align: 'right',
                render: (k) => (
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(k)}
                      className="p-1.5 rounded-md text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                      title="Edit"
                    >
                      <Key className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(k.publicKey)}
                      className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Salin public key"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {k.privateKey && (
                      <button
                        type="button"
                        onClick={() => setShowPrivate(k.id)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title={showPrivate === k.id ? 'Sembunyikan private key' : 'Tampilkan private key'}
                      >
                        {showPrivate === k.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(k.id)}
                      className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
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

      {showPrivate && keys.find((k) => k.id === showPrivate) && (
        <Modal open onClose={() => setShowPrivate(null)} title="Private Key" maxWidth="lg">
          <div className="space-y-3">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">
              ⚠️ Private key sensitif. Jangan bagikan. Tutup modal setelah disalin.
            </p>
            <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-64 whitespace-pre-wrap select-all" onClick={(e) => {
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(e.currentTarget);
              selection?.removeAllRanges();
              selection?.addRange(range);
            }}>
              {keys.find((k) => k.id === showPrivate)?.privateKey}
            </pre>
            <button type="button" onClick={() => copyToClipboard(keys.find((k) => k.id === showPrivate)?.privateKey || '')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700">
              <Copy className="w-4 h-4" />
              <span>Salin Private Key</span>
            </button>
          </div>
        </Modal>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingKey ? 'Edit Kunci SSH' : 'Tambah Kunci SSH'} maxWidth="lg">
        <form onSubmit={handleSubmit} className="space-y-4 p-1">
          <div className="grid grid-cols-[140px_1fr] gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nama Kunci</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="misal: github-deploy" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent" required />
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-4 items-start">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Public Key</label>
            <textarea value={formData.publicKey} onChange={(e) => setFormData({ ...formData, publicKey: e.target.value })} placeholder="ssh-ed25519 AAAAC3... user@host" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono min-h-[80px]" required />
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-4 items-start">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Private Key (opsional)</label>
            <textarea value={formData.privateKey} onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..." className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono min-h-[100px]" />
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-4 items-center">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Passphrase (opsional)</label>
            <input type="password" value={formData.passphrase} onChange={(e) => setFormData({ ...formData, passphrase: e.target.value })} placeholder="Kosongkan jika tanpa passphrase" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              Batal
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700">
              {editingKey ? 'Perbarui' : 'Tambah'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}