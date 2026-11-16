'use client';

import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { usePanel } from '@/components/layout/Providers';

export default function LoginPage() {
  const { notify, language } = usePanel();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cookieBlocked, setCookieBlocked] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCookieBlocked(false);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          totpCode: requires2fa ? totpCode : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        requires2fa?: boolean;
        error?: string;
        message?: string;
      };

      if (data.requires2fa && !data.ok) {
        setRequires2fa(true);
        if (data.error) setError(data.error);
        setLoading(false);
        return;
      }

      if (!res.ok || !data.ok) {
        setError(data.error || 'Login gagal.');
        setLoading(false);
        return;
      }

      const meCheck = await fetch('/api/auth/me', { credentials: 'include' });
      if (!meCheck.ok) {
        setCookieBlocked(true);
        setError(
          language === 'id'
            ? 'Login berhasil, tetapi browser Anda memblokir cookie sesi di dalam iFrame (mode Incognito / blokir cookie pihak ketiga). Buka panel di tab baru untuk masuk.'
            : 'Signed in, but your browser blocked the session cookie inside this iframe. Open the panel in a new tab.'
        );
        setLoading(false);
        return;
      }

      notify(
        'success',
        language === 'id' ? 'Berhasil masuk ke panel.' : 'Signed in successfully.'
      );
      window.location.assign('/dashboard');
    } catch {
      setError('Gagal menghubungi server panel.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-sky-600 dark:text-sky-400 mb-2">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-sm font-semibold">RackLite</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {language === 'id' ? 'Masuk ke Panel Server' : 'Sign in to Server Panel'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {language === 'id'
              ? 'Gunakan kredensial administrator atau pengguna server Anda.'
              : 'Enter your server administrator or user credentials.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 space-y-2">
            <p>{error}</p>
            {cookieBlocked && (
              <a
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-semibold underline text-sky-600 dark:text-sky-400"
              >
                {language === 'id'
                  ? 'Buka RackLite di Tab Baru →'
                  : 'Open RackLite in New Tab →'}
              </a>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {language === 'id' ? 'Kata Sandi' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {requires2fa && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Kode 2FA (TOTP 6 Digit)
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={8}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading
              ? 'Memverifikasi...'
              : requires2fa
                ? 'Verifikasi 2FA & Masuk'
                : language === 'id'
                  ? 'Masuk'
                  : 'Sign In'}
          </button>
        </form>

        <p className="mt-5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {language === 'id'
            ? 'Kredensial bawaan instalasi baru: '
            : 'Default credentials on fresh install: '}
          <span className="font-mono">admin</span> /{' '}
          <span className="font-mono">admin12345</span>
          {language === 'id'
            ? ' (atau sesuai secret PANEL_ADMIN_USER / PANEL_ADMIN_PASS jika dikonfigurasi). Segera ganti kata sandi dan aktifkan 2FA setelah login pertama.'
            : ' (or PANEL_ADMIN_USER / PANEL_ADMIN_PASS env if configured). Change your password and enable 2FA after first login.'}
        </p>
      </div>
    </div>
  );
}
