'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePanel } from '@/components/layout/Providers';
import type { PanelUser, UserRole } from '@/types/panel';

export function UsersClient({ currentRole }: { currentRole: UserRole }) {
  const { notify } = usePanel();
  const [me, setMe] = useState<PanelUser | null>(null);
  const [users, setUsers] = useState<PanelUser[]>([]);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // 2FA setup state
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [disableCode, setDisableCode] = useState('');

  // Create user modal (admin)
  const [createOpen, setCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('user');
  const [deleteTarget, setDeleteTarget] = useState<PanelUser | null>(null);

  const loadData = useCallback(async () => {
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const data = (await meRes.json()) as { user: PanelUser };
      setMe(data.user);
    }
    if (currentRole === 'admin') {
      const usersRes = await fetch('/api/users');
      if (usersRes.ok) {
        const data = (await usersRes.json()) as { users: PanelUser[] };
        setUsers(data.users || []);
      }
    }
  }, [currentRole]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal mengganti kata sandi.');
    else {
      notify('success', data.message || 'Kata sandi diperbarui.');
      setCurrentPassword('');
      setNewPassword('');
    }
  }

  async function startTotpSetup() {
    const res = await fetch('/api/auth/totp');
    if (res.ok) {
      const data = (await res.json()) as { secret: string; qrDataUrl: string };
      setTotpSetup(data);
      setTotpCode('');
    }
  }

  async function enableTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!totpSetup) return;
    const res = await fetch('/api/auth/totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'enable',
        secret: totpSetup.secret,
        code: totpCode,
      }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Aktivasi 2FA gagal.');
    else {
      notify('success', data.message || '2FA aktif.');
      setTotpSetup(null);
      loadData();
    }
  }

  async function disableTotp(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth/totp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disable', code: disableCode }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menonaktifkan 2FA.');
    else {
      notify('success', data.message || '2FA dinonaktifkan.');
      setDisableCode('');
      loadData();
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername,
        password: newUserPass,
        role: newUserRole,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal membuat akun.');
    else {
      notify('success', `Pengguna ${newUsername} ditambahkan.`);
      setCreateOpen(false);
      setNewUsername('');
      setNewUserPass('');
      loadData();
    }
  }

  async function toggleUserActive(u: PanelUser) {
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, isActive: !u.is_active }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal mengubah status.');
    else loadData();
  }

  async function handleDeleteUser() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/users?id=${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) notify('error', data.error || 'Gagal menghapus pengguna.');
    else {
      notify('success', 'Pengguna dihapus.');
      setDeleteTarget(null);
      loadData();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Keamanan Akun & Pengguna
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Ganti kata sandi, aktifkan 2FA TOTP, dan kelola multi-user panel
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ganti Password */}
        <Card title="Ganti Kata Sandi" subtitle={`Akun aktif: ${me?.username || '-'}`}>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1">
                Kata Sandi Saat Ini
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Kata Sandi Baru (min. 8 karakter)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Perbarui Kata Sandi</span>
            </button>
          </form>
        </Card>

        {/* 2FA TOTP */}
        <Card
          title="Autentikasi Dua Faktor (2FA TOTP)"
          subtitle="Kompatibel dengan Google Authenticator, Authy, atau Bitwarden"
        >
          {me?.totp_enabled ? (
            <form onSubmit={disableTotp} className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>2FA TOTP sedang aktif pada akun Anda.</span>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Masukkan kode 6 digit untuk menonaktifkan 2FA
                </label>
                <input
                  type="text"
                  required
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white"
              >
                Nonaktifkan 2FA
              </button>
            </form>
          ) : totpSetup ? (
            <form onSubmit={enableTotp} className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <Image
                  src={totpSetup.qrDataUrl}
                  alt="QR Code 2FA TOTP"
                  width={128}
                  height={128}
                  referrerPolicy="no-referrer"
                  className="w-32 h-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1"
                />
                <div className="space-y-2 text-xs">
                  <p className="text-slate-600 dark:text-slate-300">
                    Pindai QR code di aplikasi authenticator Anda, lalu masukkan 6 digit kodenya di bawah.
                  </p>
                  <div className="font-mono text-[11px] text-slate-500 break-all">
                    Secret: {totpSetup.secret}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="Kode 6 digit"
                  className="px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 w-40"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 text-white"
                >
                  Verifikasi & Aktifkan
                </button>
                <button
                  type="button"
                  onClick={() => setTotpSetup(null)}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Batal
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Lindungi akses panel Anda dengan kode TOTP sekali pakai saat login.
              </p>
              <button
                type="button"
                onClick={startTotpSetup}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-sky-600 hover:bg-sky-700 text-white"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Setup 2FA Sekarang</span>
              </button>
            </div>
          )}
        </Card>
      </div>

      {currentRole === 'admin' && (
        <Card
          title="Daftar Pengguna Panel"
          subtitle="Manajemen multi-user dan peran (admin / user)"
          actions={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Pengguna</span>
            </button>
          }
          noPadding
        >
          <DataTable
            data={users}
            rowKey={(u) => u.id}
            columns={[
              {
                key: 'username',
                header: 'Username',
                render: (u) => (
                  <span className="font-mono text-xs font-semibold">
                    {u.username}
                  </span>
                ),
              },
              {
                key: 'role',
                header: 'Role',
                render: (u) => (
                  <span className="text-xs font-medium">{u.role}</span>
                ),
              },
              {
                key: '2fa',
                header: '2FA',
                render: (u) => (
                  <span className="text-xs text-slate-500">
                    {u.totp_enabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (u) => (
                  <span
                    className={`text-xs font-medium ${
                      u.is_active
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {u.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                ),
              },
              {
                key: 'last',
                header: 'Login Terakhir',
                render: (u) => (
                  <span className="font-mono text-xs text-slate-500">
                    {u.last_login_at || '-'}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Aksi',
                align: 'right',
                render: (u) => (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleUserActive(u)}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    {u.id !== me?.id && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(u)}
                        className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tambah Pengguna Panel"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Username</label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="operator1"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Kata Sandi</label>
            <input
              type="password"
              required
              minLength={8}
              value={newUserPass}
              onChange={(e) => setNewUserPass(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Role</label>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="user">User (Terbatas)</option>
              <option value="admin">Administrator (Penuh + Terminal)</option>
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
              Simpan Pengguna
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUser}
        title="Hapus Pengguna"
        description={`Yakin ingin menghapus akun "${deleteTarget?.username}"?`}
        confirmLabel="Hapus"
      />
    </div>
  );
}
