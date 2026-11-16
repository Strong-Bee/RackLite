'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save, Shield, TestTube, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { usePanel } from '@/components/layout/Providers';
import type { SmtpConfig } from '@/types/panel';

export function SmtpClient() {
  const { t, notify, language } = usePanel();
  const [config, setConfig] = useState<SmtpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = (await res.json()) as { smtp?: SmtpConfig };
      setConfig(data.smtp || null);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadConfig());
  }, [loadConfig]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtp: config }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) notify('error', data.error || t.common.save + ' gagal');
      else {
        notify('success', data.message || t.common.save + ' berhasil');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!config?.host || !config?.port) {
      notify('error', 'Isi host dan port terlebih dahulu');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpTest: config }),
      });
      const data = (await res.json()) as { success: boolean; message: string };
      setTestResult(data);
      notify(data.success ? 'success' : 'error', data.message);
    } finally {
      setTesting(false);
    }
  }

  function handleChange(field: keyof SmtpConfig, value: string | boolean | number) {
    setConfig((prev) => ({ ...(prev || { host: '', port: 587, secure: false, auth: true, username: '', password: '', from: '' }), [field]: value }));
  }

  const fields: Array<{ key: keyof SmtpConfig; label: string; type: 'text' | 'number' | 'checkbox' | 'password'; placeholder?: string }> = [
    { key: 'host', label: 'SMTP Host', type: 'text', placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Port', type: 'number', placeholder: '587' },
    { key: 'secure', label: 'SSL/TLS (Implicit TLS)', type: 'checkbox' },
    { key: 'auth', label: 'Autentikasi', type: 'checkbox' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'user@example.com' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    { key: 'from', label: 'From Address', type: 'text', placeholder: 'noreply@example.com' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">SMTP Mail</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Konfigurasi pengiriman email notifikasi, laporan backup, dan alarm panel
          </p>
        </div>
        <button type="button" onClick={loadConfig} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Muat Ulang</span>
        </button>
      </div>

      <Card className="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4 p-1">
          {fields.map((field) => (
            <div key={field.key} className="grid grid-cols-[180px_1fr] gap-4 items-center">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{field.label}</label>
              {field.type === 'checkbox' ? (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(config?.[field.key] as boolean) ?? false}
                    onChange={(e) => handleChange(field.key, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Aktifkan</span>
                </label>
              ) : (
                <input
                  type={field.type}
                  value={(config?.[field.key] as string | number) ?? ''}
                  onChange={(e) => handleChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              )}
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <TestTube className="w-3.5 h-3.5" />
              <span>{testing ? 'Menguji...' : 'Uji Kirim'}</span>
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : t.common.save}</span>
            </button>
          </div>
        </form>

        {testResult && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}
          >
            {testResult.success ? (
              <>
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Tes email berhasil dikirim ke {config?.from || 'alamat pengirim'}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{testResult.message}</span>
              </>
            )}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Informasi</h3>
          <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <li>• Gunakan port 587 (STARTTLS) atau 465 (SSL/TLS implicit)</li>
            <li>• Untuk Gmail: aktifkan &apos;App Password&apos; di akun Google</li>
            <li>• Tes email akan dikirim ke alamat <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">{config?.from || "from address"}</code></li>
            <li>• Konfigurasi disimpan di database panel (sqlite), tidak di file .env</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}