'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Box, Play, Square, RotateCw, Trash2, Logs, Download, Search, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/Table';
import { usePanel } from '@/components/layout/Providers';
import type { DockerContainer, DockerImage } from '@/types/panel';

export function DockerClient() {
  const { t, notify } = usePanel();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'containers' | 'images'>('containers');
  const [dockerAvailable, setDockerAvailable] = useState(true);
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullImage, setPullImage] = useState('');
  const [pulling, setPulling] = useState(false);
  const [logsModal, setLogsModal] = useState<{ name: string; logs: string } | null>(null);
  const [inspectModal, setInspectModal] = useState<{ type: 'container' | 'image'; data: unknown } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [containersRes, imagesRes] = await Promise.all([
        fetch('/api/docker?type=containers'),
        fetch('/api/docker?type=images'),
      ]);
      const containersData = (await containersRes.json()) as { available?: boolean; containers?: DockerContainer[] };
      const imagesData = (await imagesRes.json()) as { available?: boolean; images?: DockerImage[] };
      setDockerAvailable(containersData.available ?? false);
      setContainers(containersData.containers || []);
      setImages(imagesData.images || []);
    } catch {
      setDockerAvailable(false);
      setContainers([]);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadData());
  }, [loadData]);

  async function handleContainerAction(id: string, action: 'start' | 'stop' | 'restart' | 'remove') {
    try {
      const res = await fetch('/api/docker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'container', action, id }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) notify('error', data.error || 'Aksi container gagal');
      else {
        notify('success', data.message || `Container ${action} selesai`);
        loadData();
      }
    } catch {
      notify('error', 'Terjadi kesalahan jaringan');
    }
  }

  async function handleImageAction(id: string, action: 'pull' | 'remove') {
    if (action === 'remove') {
      if (!confirm('Hapus image ini? Container yang menggunakan image ini mungkin akan rusak.')) return;
    }
    try {
      const res = await fetch('/api/docker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'image', action, id: action === 'pull' ? pullImage : id }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) notify('error', data.error || 'Aksi image gagal');
      else {
        notify('success', data.message || `Image ${action} selesai`);
        setShowPullModal(false);
        setPullImage('');
        loadData();
      }
    } catch {
      notify('error', 'Terjadi kesalahan jaringan');
    } finally {
      setPulling(false);
    }
  }

  async function viewLogs(id: string, name: string) {
    try {
      const res = await fetch(`/api/docker?logs=${encodeURIComponent(id)}`);
      const data = (await res.json()) as { logs?: string };
      setLogsModal({ name, logs: data.logs || '(Tidak ada log)' });
    } catch {
      notify('error', 'Gagal mengambil log');
    }
  }

  async function inspect(type: 'container' | 'image', id: string) {
    try {
      const res = await fetch(`/api/docker?inspect=${type}&id=${encodeURIComponent(id)}`);
      const data = (await res.json()) as { data?: unknown };
      setInspectModal({ type, data: data.data || {} });
    } catch {
      notify('error', 'Gagal mengambil detail');
    }
  }

  function getStatusBadge(status: string) {
    const running = status.includes('Up') || status.includes('running');
    const exited = status.includes('Exited') || status.includes('stopped');
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded ${running ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : exited ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
        {status}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Docker</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola container dan image Docker di server
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={loadData} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Muat Ulang</span>
          </button>
          {activeTab === 'images' && (
            <button type="button" onClick={() => setShowPullModal(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 whitespace-nowrap">
              <Plus className="w-4 h-4" />
              <span>Pull Image</span>
            </button>
          )}
        </div>
      </div>

      {!dockerAvailable && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <div className="p-4 flex items-center gap-3">
            <Box className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">Docker tidak tersedia</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">Docker daemon tidak berjalan atau tidak diizinkan di lingkungan ini. Fitur ini memerlukan akses ke Docker socket.</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('containers')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'containers' ? 'bg-white dark:bg-slate-900 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'}`}
        >
          Container
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('images')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'images' ? 'bg-white dark:bg-slate-900 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'}`}
        >
          Image
        </button>
      </div>

      <Card noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Memuat data Docker...</div>
        ) : activeTab === 'containers' ? (
          containers.length === 0 ? (
            <div className="p-8 text-center">
              <Box className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">Tidak ada container</p>
            </div>
          ) : (
            <DataTable
              data={containers}
              rowKey={(c) => c.id}
              columns={[
                {
                  key: 'name',
                  header: 'Nama',
                  render: (c) => (
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{c.name}</div>
                      <div className="text-xs font-mono text-slate-500">{c.id.slice(0, 12)}</div>
                    </div>
                  ),
                },
                {
                  key: 'image',
                  header: 'Image',
                  render: (c) => <span className="text-sm font-mono text-slate-600 dark:text-slate-300">{c.image}</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (c) => getStatusBadge(c.status),
                },
                {
                  key: 'ports',
                  header: 'Ports',
                  render: (c) => (
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {c.ports && c.ports.length > 0 ? c.ports.map((p) => `${p.IP || '0.0.0.0'}:${p.PublicPort}→${p.PrivatePort}/${p.Type}`).join(', ') : '—'}
                    </span>
                  ),
                },
                {
                  key: 'created',
                  header: 'Dibuat',
                  render: (c) => new Date(c.created * 1000).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                },
                {
                  key: 'actions',
                  header: 'Aksi',
                  align: 'right',
                  render: (c) => {
                    const running = c.status.includes('Up') || c.status.includes('running');
                    return (
                      <div className="inline-flex items-center gap-1">
                        {running ? (
                          <>
                            <button type="button" onClick={() => handleContainerAction(c.id, 'stop')} className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" title="Stop"><Square className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => handleContainerAction(c.id, 'restart')} className="p-1.5 rounded-md text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40" title="Restart"><RotateCw className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <button type="button" onClick={() => handleContainerAction(c.id, 'start')} className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Start"><Play className="w-3.5 h-3.5" /></button>
                        )}
                        <button type="button" onClick={() => viewLogs(c.id, c.name)} className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800" title="Log"><Logs className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => inspect('container', c.id)} className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800" title="Inspect"><Search className="w-3.5 h-3.5" /></button>
                        <button type="button" onClick={() => handleContainerAction(c.id, 'remove')} className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  },
                },
              ]}
            />
          )
        ) : (
          images.length === 0 ? (
            <div className="p-8 text-center">
              <Box className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400">Tidak ada image</p>
              <button type="button" onClick={() => setShowPullModal(true)} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700">
                <Plus className="w-4 h-4" />
                <span>Pull Image Pertama</span>
              </button>
            </div>
          ) : (
            <DataTable
              data={images}
              rowKey={(i) => i.id}
              columns={[
                {
                  key: 'repository',
                  header: 'Repository',
                  render: (i) => (
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{i.repository}</div>
                      <div className="text-xs font-mono text-slate-500">{i.tag}</div>
                    </div>
                  ),
                },
                {
                  key: 'id',
                  header: 'Image ID',
                  render: (i) => <span className="text-xs font-mono text-slate-500">{i.id.slice(0, 12)}</span>,
                },
                {
                  key: 'size',
                  header: 'Ukuran',
                  render: (i) => <span className="text-sm text-slate-600 dark:text-slate-300 font-mono">{(i.size / (1024 * 1024)).toFixed(1)} MB</span>,
                },
                {
                  key: 'created',
                  header: 'Dibuat',
                  render: (i) => new Date(i.created * 1000).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }),
                },
                {
                  key: 'actions',
                  header: 'Aksi',
                  align: 'right',
                  render: (i) => (
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => inspect('image', i.id)} className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800" title="Inspect"><Search className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => handleImageAction(i.id, 'remove')} className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40" title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ),
                },
              ]}
            />
          )
        )}
      </Card>

      {logsModal && (
        <Modal open onClose={() => setLogsModal(null)} title={`Log Container: ${logsModal.name}`} maxWidth="xl">
          <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-96 whitespace-pre-wrap">
            {logsModal.logs}
          </pre>
        </Modal>
      )}

      {inspectModal && (
        <Modal open onClose={() => setInspectModal(null)} title={`Inspect ${inspectModal.type}`} maxWidth="xl">
          <pre className="p-3 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-96 whitespace-pre-wrap">
            {JSON.stringify(inspectModal.data, null, 2)}
          </pre>
        </Modal>
      )}

      <Modal open={showPullModal} onClose={() => setShowPullModal(false)} title="Pull Docker Image" maxWidth="md">
        <form onSubmit={(e) => { e.preventDefault(); if (pullImage.trim()) { setPulling(true); handleImageAction('', 'pull'); } }} className="space-y-4 p-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Image</label>
            <input
              type="text"
              value={pullImage}
              onChange={(e) => setPullImage(e.target.value)}
              placeholder="nginx:alpine, redis:7, postgres:15..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              required
              autoFocus
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Format: repository:tag (default latest jika tag kosong)</p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setShowPullModal(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Batal</button>
            <button type="submit" disabled={pulling} className="px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">{pulling ? 'Mengunduh...' : 'Pull Image'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}