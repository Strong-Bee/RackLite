'use client';

import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { usePanel } from '@/components/layout/Providers';
import type { LanguageCode, PanelSettings, ThemeMode, UserRole } from '@/types/panel';

export function SettingsClient({ currentRole }: { currentRole: UserRole }) {
  const { setTheme, setLanguage, notify } = usePanel();
  const [form, setForm] = useState<PanelSettings>({
    panel_port: '3000',
    panel_domain: 'localhost',
    ip_whitelist: '',
    theme: 'dark',
    language: 'id',
    s3_endpoint: '',
    s3_bucket: '',
    s3_region: 'us-east-1',
    s3_access_key: '',
    s3_secret_key: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data: { settings?: Partial<PanelSettings> }) => {
        if (data.settings) {
          setForm((prev) => ({ ...prev, ...data.settings }));
        }
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        notify('error', data.error || 'Gagal menyimpan pengaturan.');
      } else {
        setTheme(form.theme);
        setLanguage(form.language);
        notify('success', data.message || 'Pengaturan disimpan.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Pengaturan Panel
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Konfigurasi port, domain panel, IP whitelist, tema, bahasa, dan target S3 backup
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Umum & Akses Panel">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Port Panel
                  </label>
                  <input
                    type="text"
                    required
                    disabled={currentRole !== 'admin'}
                    value={form.panel_port}
                    onChange={(e) =>
                      setForm({ ...form, panel_port: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Domain Panel
                  </label>
                  <input
                    type="text"
                    required
                    disabled={currentRole !== 'admin'}
                    value={form.panel_domain}
                    onChange={(e) =>
                      setForm({ ...form, panel_domain: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  IP Whitelist (pisahkan koma, kosongkan untuk izinkan semua)
                </label>
                <input
                  type="text"
                  disabled={currentRole !== 'admin'}
                  value={form.ip_whitelist}
                  onChange={(e) =>
                    setForm({ ...form, ip_whitelist: e.target.value })
                  }
                  placeholder="203.0.113.10, 10.0.0.0/8"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Tema</label>
                  <select
                    value={form.theme}
                    onChange={(e) => {
                      const next = e.target.value as ThemeMode;
                      setForm({ ...form, theme: next });
                      setTheme(next);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="dark">Gelap (Dark)</option>
                    <option value="light">Terang (Light)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Bahasa</label>
                  <select
                    value={form.language}
                    onChange={(e) => {
                      const next = e.target.value as LanguageCode;
                      setForm({ ...form, language: next });
                      setLanguage(next);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Penyimpanan Backup S3-Compatible">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Endpoint S3
                </label>
                <input
                  type="text"
                  disabled={currentRole !== 'admin'}
                  value={form.s3_endpoint}
                  onChange={(e) =>
                    setForm({ ...form, s3_endpoint: e.target.value })
                  }
                  placeholder="https://s3.ap-southeast-1.amazonaws.com"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Bucket</label>
                  <input
                    type="text"
                    disabled={currentRole !== 'admin'}
                    value={form.s3_bucket}
                    onChange={(e) =>
                      setForm({ ...form, s3_bucket: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Region</label>
                  <input
                    type="text"
                    disabled={currentRole !== 'admin'}
                    value={form.s3_region}
                    onChange={(e) =>
                      setForm({ ...form, s3_region: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Access Key
                  </label>
                  <input
                    type="text"
                    disabled={currentRole !== 'admin'}
                    value={form.s3_access_key}
                    onChange={(e) =>
                      setForm({ ...form, s3_access_key: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Secret Key
                  </label>
                  <input
                    type="password"
                    disabled={currentRole !== 'admin'}
                    value={form.s3_secret_key}
                    onChange={(e) =>
                      setForm({ ...form, s3_secret_key: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {currentRole === 'admin' && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
