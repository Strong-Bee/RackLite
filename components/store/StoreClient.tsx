'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Download, Trash2, Check, AlertCircle, Package, Search, Filter, MoreHorizontal, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { usePanel } from '@/components/layout/Providers';
import type { AppStoreItem, InstalledApp } from '@/types/panel';

export function StoreClient() {
  const { t, notify } = usePanel();
  const [availableApps, setAvailableApps] = useState<AppStoreItem[]>([]);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showDetails, setShowDetails] = useState<AppStoreItem | null>(null);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const [availRes, installedRes] = await Promise.all([
        fetch('/api/store/available'),
        fetch('/api/store/installed'),
      ]);
      const availData = (await availRes.json()) as { apps?: AppStoreItem[] };
      const installedData = (await installedRes.json()) as { apps?: InstalledApp[] };
      setAvailableApps(availData.apps || []);
      setInstalledApps(installedData.apps || []);
    } catch {
      setAvailableApps([]);
      setInstalledApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadApps());
  }, [loadApps]);

  const categories = Array.from(new Set(availableApps.map(a => a.category))).filter(Boolean);

  async function handleInstall(app: AppStoreItem) {
    setInstalling(app.id);
    try {
      const res = await fetch('/api/store/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: app.id, version: app.latestVersion }),
      });
      const data = (await res.json()) as { message?: string; error?: string; app?: InstalledApp };
      if (!res.ok) notify('error', data.error || 'Gagal menginstal');
      else {
        notify('success', data.message || `${app.name} terinstal`);
        if (data.app) setInstalledApps(prev => [...prev, data.app!]);
        loadApps();
      }
    } catch {
      notify('error', 'Terjadi kesalahan jaringan');
    } finally {
      setInstalling(null);
    }
  }

  async function handleUninstall(app: InstalledApp) {
    if (!confirm(`Hapus ${app.name}? Tindakan ini tidak bisa dibatalkan.`)) return;
    setUninstalling(app.id);
    try {
      const res = await fetch(`/api/store/installed/${app.id}`, { method: 'DELETE' });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) notify('error', data.error || 'Gagal menghapus');
      else {
        notify('success', data.message || `${app.name} dihapus`);
        setInstalledApps(prev => prev.filter(a => a.id !== app.id));
      }
    } catch {
      notify('error', 'Terjadi kesalahan jaringan');
    } finally {
      setUninstalling(null);
    }
  }

  const filteredApps = availableApps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || app.category === filterCategory;
    const isInstalled = installedApps.some(i => i.appId === app.id);
    return matchesSearch && matchesCategory && !isInstalled;
  });

  const installedFiltered = installedApps.filter(app =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">App Store</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Temukan dan instal aplikasi web populer (WordPress, Ghost, Nextcloud, dll)
          </p>
        </div>
        <button type="button" onClick={loadApps} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Search & Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cari aplikasi..."
              className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent whitespace-nowrap"
          >
            <option value="all">Semua Kategori</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Available Apps */}
      <Card noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Memuat App Store...</div>
        ) : filteredApps.length === 0 && searchQuery === '' && filterCategory === 'all' ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Semua aplikasi tersedia sudah terinstal</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="p-8 text-center">
            <Search className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Tidak ada aplikasi cocok</p>
            <button type="button" onClick={() => { setSearchQuery(''); setFilterCategory('all'); }} className="mt-3 text-sm text-sky-600 hover:underline">Reset filter</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredApps.map(app => {
              const isInstalling = installing === app.id;
              return (
                <div key={app.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                      <Package className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">{app.name}</h3>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">v{app.latestVersion}</span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{app.description}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">{app.category}</span>
                        {app.tags.map(tag => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{tag}</span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {app.size ? `${(app.size / 1024 / 1024).toFixed(1)} MB` : 'Ukuran tidak diketahui'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleInstall(app)}
                          disabled={isInstalling}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isInstalling ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Menginstal...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Instal</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Installed Apps */}
      {installedApps.length > 0 && (
        <Card noPadding>
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Package className="w-5 h-5 text-sky-600" />
              Terinstal ({installedApps.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {installedFiltered.map(app => (
              <div key={app.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">{app.name}</h3>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">v{app.version}</span>
                      {app.status === 'running' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Aktif
                        </span>
                      )}
                      {app.status === 'stopped' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Dihentikan
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{app.path}</p>
                    {app.url && (
                      <a href={app.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline inline-flex items-center gap-1 mt-1">
                        <ChevronRight className="w-3 h-3" />
                        Buka aplikasi
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleUninstall(app)}
                    disabled={uninstalling === app.id}
                    className="p-2 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                    title="Uninstall"
                  >
                    {uninstalling === app.id ? (
                      <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {installedFiltered.length === 0 && installedApps.length > 0 && (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                Tidak ada aplikasi terinstal cocok pencarian
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Info */}
      <Card className="border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30">
        <div className="p-4">
          <h3 className="text-sm font-medium text-sky-800 dark:text-sky-200 mb-2 flex items-center gap-1.5">
            <Package className="w-4 h-4" />
            Tentang App Store
          </h3>
          <ul className="text-xs text-sky-700 dark:text-sky-300 space-y-1">
            <li>• Aplikasi diinstal ke direktori terpisah di bawah <code className="font-mono bg-white dark:bg-slate-800 px-1 rounded">/var/www/apps/</code> (Linux) atau <code className="font-mono bg-white dark:bg-slate-800 px-1 rounded">./data/apps/</code> (Windows)</li>
            <li>• Setiap aplikasi memiliki Nginx vhost otomatis dengan subdomain atau path prefix</li>
            <li>• Database (MariaDB/PostgreSQL) dibuat otomatis saat instalasi jika diperlukan</li>
            <li>• Update aplikasi: klik &quot;Instal&quot; ulang pada versi baru (backup otomatis sebelum update)</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
