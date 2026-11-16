'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Archive,
  Clock,
  Database,
  FileText,
  FolderOpen,
  Globe,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Server,
  Settings,
  Shield,
  Sun,
  Terminal,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { usePanel } from '@/components/layout/Providers';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/panel';

interface PanelShellProps {
  username: string;
  role: UserRole;
  children: React.ReactNode;
}

export function PanelShell({ username, role, children }: PanelShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme, language, setLanguage, t, notify } = usePanel();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navGroups: Array<{
    label: string;
    items: Array<{
      href: string;
      label: string;
      icon: LucideIcon;
      adminOnly: boolean;
    }>;
  }> = [
    {
      label: t.groups.overview,
      items: [
        { href: '/dashboard', label: t.nav.dashboard, icon: Activity, adminOnly: false },
      ],
    },
    {
      label: t.groups.compute,
      items: [
        { href: '/files', label: t.nav.files, icon: FolderOpen, adminOnly: false },
        { href: '/terminal', label: t.nav.terminal, icon: Terminal, adminOnly: true },
        { href: '/services', label: t.nav.services, icon: Server, adminOnly: false },
        { href: '/cron', label: t.nav.cron, icon: Clock, adminOnly: false },
      ],
    },
    {
      label: t.groups.networking,
      items: [
        { href: '/websites', label: t.nav.websites, icon: Globe, adminOnly: false },
        { href: '/databases', label: t.nav.databases, icon: Database, adminOnly: false },
        { href: '/firewall', label: t.nav.firewall, icon: Shield, adminOnly: false },
      ],
    },
    {
      label: t.groups.operations,
      items: [
        { href: '/backups', label: t.nav.backups, icon: Archive, adminOnly: false },
        { href: '/logs', label: t.nav.logs, icon: FileText, adminOnly: false },
        { href: '/audit', label: t.nav.audit, icon: ScrollText, adminOnly: false },
        { href: '/users', label: t.nav.users, icon: Users, adminOnly: false },
        { href: '/settings', label: t.nav.settings, icon: Settings, adminOnly: false },
      ],
    },
  ];

  const activeItem = navGroups
    .flatMap((g) => g.items)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    notify('info', language === 'id' ? 'Anda telah keluar.' : 'Signed out.');
    router.push('/login');
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
        <Link
          href="/dashboard"
          className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap"
          onClick={() => setMobileOpen(false)}
        >
          RackLite
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Tutup menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || role === 'admin'
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              <div className="px-3 mb-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                        active
                          ? 'bg-sky-600/10 text-sky-600 dark:text-sky-400'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <div className="px-3 py-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate font-medium text-slate-700 dark:text-slate-200">
            {username} · {role}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.nav.logout}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-14 sticky top-0 z-20 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                RackLite
              </span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeItem?.label || 'Panel'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLanguage(language === 'id' ? 'en' : 'id')}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              title="Ganti bahasa"
            >
              {language.toUpperCase()}
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Ganti tema gelap atau terang"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
