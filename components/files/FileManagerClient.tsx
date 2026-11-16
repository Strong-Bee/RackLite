'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowUp,
  Download,
  Edit3,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderPlus,
  KeyRound,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { usePanel } from '@/components/layout/Providers';
import type { FileEntry } from '@/types/panel';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileManagerClient() {
  const { notify } = usePanel();
  const [currentPath, setCurrentPath] = useState('');
  const [roots, setRoots] = useState<string[]>([]);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [createKind, setCreateKind] = useState<'file' | 'directory' | null>(null);
  const [newName, setNewName] = useState('');

  const [editingFile, setEditingFile] = useState<{
    path: string;
    content: string;
  } | null>(null);
  const [savingFile, setSavingFile] = useState(false);

  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const [permTarget, setPermTarget] = useState<FileEntry | null>(null);
  const [chmodVal, setChmodVal] = useState('644');
  const [chownVal, setChownVal] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDir = useCallback(
    async (targetPath = '') => {
      setLoading(true);
      try {
        const qs = targetPath
          ? `?path=${encodeURIComponent(targetPath)}`
          : '';
        const res = await fetch(`/api/files${qs}`);
        const data = (await res.json()) as {
          currentPath?: string;
          roots?: string[];
          entries?: FileEntry[];
          error?: string;
        };
        if (!res.ok) {
          notify('error', data.error || 'Gagal memuat direktori.');
        } else {
          setCurrentPath(data.currentPath || '');
          setRoots(data.roots || []);
          setEntries(data.entries || []);
        }
      } catch {
        notify('error', 'Koneksi gagal saat memuat berkas.');
      } finally {
        setLoading(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    queueMicrotask(() => {
      void loadDir('');
    });
  }, [loadDir]);

  const isAtRoot = roots.includes(currentPath);

  function goUp() {
    if (isAtRoot || !currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parent = '/' + parts.join('/');
    loadDir(parent);
  }

  async function openFileEditor(entry: FileEntry) {
    try {
      const res = await fetch(
        `/api/files?mode=read&path=${encodeURIComponent(entry.path)}`
      );
      const data = (await res.json()) as {
        path?: string;
        content?: string;
        error?: string;
      };
      if (!res.ok) {
        notify('error', data.error || 'Gagal membuka berkas.');
        return;
      }
      setEditingFile({
        path: data.path || entry.path,
        content: data.content || '',
      });
    } catch {
      notify('error', 'Gagal membaca isi berkas.');
    }
  }

  async function handleSaveEditor() {
    if (!editingFile) return;
    setSavingFile(true);
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'write',
          path: editingFile.path,
          content: editingFile.content,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        notify('error', data.error || 'Gagal menyimpan berkas.');
      } else {
        notify('success', 'Berkas berhasil disimpan.');
        setEditingFile(null);
        loadDir(currentPath);
      }
    } finally {
      setSavingFile(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createKind || !newName.trim()) return;
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        parentPath: currentPath,
        name: newName.trim(),
        kind: createKind,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      notify('error', data.error || 'Gagal membuat entri.');
    } else {
      notify('success', `${createKind === 'directory' ? 'Folder' : 'Berkas'} dibuat.`);
      setCreateKind(null);
      setNewName('');
      loadDir(currentPath);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameVal.trim()) return;
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'rename',
        path: renameTarget.path,
        newName: renameVal.trim(),
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      notify('error', data.error || 'Gagal mengganti nama.');
    } else {
      notify('success', 'Nama berhasil diubah.');
      setRenameTarget(null);
      loadDir(currentPath);
    }
  }

  async function handlePermissions(e: React.FormEvent) {
    e.preventDefault();
    if (!permTarget) return;
    const chmodRes = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'chmod',
        path: permTarget.path,
        mode: chmodVal.trim(),
      }),
    });
    const chmodData = (await chmodRes.json()) as { ok?: boolean; error?: string };
    if (!chmodRes.ok) {
      notify('error', chmodData.error || 'Gagal mengubah chmod.');
      return;
    }

    if (chownVal.trim()) {
      const [owner, group] = chownVal.trim().split(':');
      const chownRes = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chown',
          path: permTarget.path,
          owner,
          group,
        }),
      });
      const chownData = (await chownRes.json()) as { error?: string };
      if (!chownRes.ok) {
        notify('error', chownData.error || 'Chmod tersimpan, namun chown gagal.');
        setPermTarget(null);
        loadDir(currentPath);
        return;
      }
    }

    notify('success', 'Izin berkas diperbarui.');
    setPermTarget(null);
    loadDir(currentPath);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(
      `/api/files?path=${encodeURIComponent(deleteTarget.path)}`,
      { method: 'DELETE' }
    );
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      notify('error', data.error || 'Gagal menghapus.');
    } else {
      notify('success', `${deleteTarget.name} dihapus.`);
      setDeleteTarget(null);
      loadDir(currentPath);
    }
  }

  async function handleZip(entry: FileEntry) {
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'zip', path: entry.path }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal kompres ZIP.');
    else {
      notify('success', 'Arsip ZIP berhasil dibuat.');
      loadDir(currentPath);
    }
  }

  async function handleUnzip(entry: FileEntry) {
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unzip', path: entry.path }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal ekstrak ZIP.');
    else {
      notify('success', 'Arsip ZIP berhasil diekstrak.');
      loadDir(currentPath);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('dir', currentPath);
    formData.append('file', file);
    const res = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData,
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) notify('error', data.error || 'Upload gagal.');
    else {
      notify('success', `${file.name} berhasil diunggah.`);
      loadDir(currentPath);
    }
    e.target.value = '';
  }

  const filtered = entries.filter((e) =>
    e.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            File Manager
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Direktori aman dengan proteksi path traversal dan arsip ZIP
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateKind('file');
              setNewName('');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>File Baru</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateKind('directory');
              setNewName('');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white whitespace-nowrap"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Folder Baru</span>
          </button>
        </div>
      </div>

      <Card noPadding>
        {/* Toolbar Path & Search */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={goUp}
              disabled={isAtRoot}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              title="Naik satu tingkat"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <select
              value={roots.find((r) => currentPath.startsWith(r)) || roots[0] || ''}
              onChange={(e) => loadDir(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              {roots.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate">
              {currentPath}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter berkas..."
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 w-44"
            />
            <button
              type="button"
              onClick={() => loadDir(currentPath)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Muat ulang direktori"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : (
          <DataTable
            data={filtered}
            rowKey={(item) => item.path}
            emptyState={
              <EmptyState
                icon={Folder}
                title="Direktori kosong"
                description="Belum ada berkas atau folder di lokasi ini."
              />
            }
            columns={[
              {
                key: 'name',
                header: 'Nama',
                render: (item) => (
                  <button
                    type="button"
                    onClick={() =>
                      item.type === 'directory'
                        ? loadDir(item.path)
                        : openFileEditor(item)
                    }
                    className="inline-flex items-center gap-2 text-left font-medium text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400"
                  >
                    {item.type === 'directory' ? (
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                    ) : (
                      <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate max-w-[260px]">{item.name}</span>
                  </button>
                ),
              },
              {
                key: 'size',
                header: 'Ukuran',
                align: 'right',
                render: (item) => (
                  <span className="font-mono text-xs text-slate-500">
                    {item.type === 'directory' ? '-' : formatSize(item.size)}
                  </span>
                ),
              },
              {
                key: 'mode',
                header: 'Izin / Owner',
                render: (item) => (
                  <span className="font-mono text-xs text-slate-500">
                    {item.mode} · {item.owner}
                  </span>
                ),
              },
              {
                key: 'modified',
                header: 'Diubah',
                render: (item) => (
                  <span className="font-mono text-xs text-slate-500">
                    {new Date(item.modifiedAt).toLocaleString('id-ID')}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Aksi',
                align: 'right',
                render: (item) => (
                  <div className="inline-flex items-center justify-end gap-1">
                    {item.type === 'file' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openFileEditor(item)}
                          className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`/api/files/download?path=${encodeURIComponent(item.path)}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Unduh"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}
                    {item.name.endsWith('.zip') ? (
                      <button
                        type="button"
                        onClick={() => handleUnzip(item)}
                        className="px-2 py-1 text-[11px] font-medium rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Ekstrak ZIP"
                      >
                        Unzip
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleZip(item)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Kompres ke ZIP"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPermTarget(item);
                        setChmodVal(item.mode);
                        setChownVal('');
                      }}
                      className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Chmod / Chown"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenameTarget(item);
                        setRenameVal(item.name);
                      }}
                      className="px-2 py-1 text-[11px] font-medium rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
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

      {/* Modal Buat Berkas / Folder */}
      <Modal
        open={createKind !== null}
        onClose={() => setCreateKind(null)}
        title={createKind === 'directory' ? 'Buat Folder Baru' : 'Buat Berkas Baru'}
        maxWidth="sm"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <input
            type="text"
            required
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={createKind === 'directory' ? 'nama-folder' : 'index.html'}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateKind(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700"
            >
              Buat
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Code Editor Sederhana */}
      <Modal
        open={editingFile !== null}
        onClose={() => setEditingFile(null)}
        title="Editor Berkas"
        subtitle={editingFile?.path}
        maxWidth="xl"
      >
        {editingFile && (
          <div className="space-y-4">
            <textarea
              value={editingFile.content}
              onChange={(e) =>
                setEditingFile({ ...editingFile, content: e.target.value })
              }
              rows={18}
              spellCheck={false}
              className="w-full p-3 font-mono text-xs leading-relaxed rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingFile(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleSaveEditor}
                disabled={savingFile}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {savingFile ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Rename */}
      <Modal
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Ganti Nama"
        maxWidth="sm"
      >
        <form onSubmit={handleRename} className="space-y-4">
          <input
            type="text"
            required
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white"
            >
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Chmod / Chown */}
      <Modal
        open={permTarget !== null}
        onClose={() => setPermTarget(null)}
        title="Ubah Izin & Kepemilikan"
        subtitle={permTarget?.name}
        maxWidth="sm"
      >
        <form onSubmit={handlePermissions} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Mode Oktal (chmod)
            </label>
            <input
              type="text"
              required
              pattern="^[0-7]{3,4}$"
              value={chmodVal}
              onChange={(e) => setChmodVal(e.target.value)}
              placeholder="755"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Owner:Group (chown, opsional — khusus admin)
            </label>
            <input
              type="text"
              value={chownVal}
              onChange={(e) => setChownVal(e.target.value)}
              placeholder="www-data:www-data"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPermTarget(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white"
            >
              Terapkan
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Berkas / Folder"
        description={`Yakin ingin menghapus "${deleteTarget?.name}" secara permanen?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}
