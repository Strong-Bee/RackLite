'use client';

import React, { useEffect, useState } from 'react';
import { usePanel } from '@/components/layout/Providers';
import {
  AlertTriangle,
  Shield,
  Lock,
  Unlock,
  Activity,
  TrendingUp,
  TrendingDown,
  X,
  Search,
  RefreshCw,
  Loader2,
  MapPin,
  User,
  Zap,
  Database,
  Server,
  Wifi,
  Terminal,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

interface SecurityStats {
  totalAttempts: number;
  failedAttempts: number;
  blockedIps: number;
  criticalEvents: number;
  warningEvents: number;
  topAttackerIps: Array<{ ip: string; attempts: number; threatScore: number }>;
}

interface SecurityEvent {
  id: number;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  ip_address: string | null;
  username: string | null;
  details: string;
  raw_data: string | null;
  created_at: string;
}

interface BlockedIP {
  id: number;
  ip_address: string;
  reason: string;
  threat_score: number;
  attempts_count: number;
  blocked_at: string;
  expires_at: string | null;
  is_permanent: number;
  created_by: string;
}

interface SecurityData {
  stats: SecurityStats;
  events: SecurityEvent[];
  blockedIps: BlockedIP[];
}

export function SecurityClient() {
  const { t, notify } = usePanel();
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({ ip: '', reason: '', permanent: false });
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const fetchData = async () => {
    try {
      const res = await fetch('/api/security/stats?limit=100');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch security data:', err);
      notify('error', t.common.noData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchData, 30000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleBlockIp = async () => {
    try {
      const res = await fetch('/api/security/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blockForm),
      });
      if (res.ok) {
        notify('success', `${t.store.installSuccess}: ${blockForm.ip}`);
        setShowBlockModal(false);
        setBlockForm({ ip: '', reason: '', permanent: false });
        fetchData();
      } else {
        const err = await res.json();
        notify('error', err.error || t.store.installFailed);
      }
    } catch {
      notify('error', t.store.installFailed);
    }
  };

  const handleUnblockIp = async (ip: string) => {
    try {
      const res = await fetch('/api/security/block', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        notify('success', `${t.store.uninstallSuccess}: ${ip}`);
        fetchData();
      } else {
        notify('error', t.store.uninstallFailed);
      }
    } catch {
      notify('error', t.store.uninstallFailed);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'warning': return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30';
      default: return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="w-4 h-4" />;
      case 'warning': return <Zap className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const isExpanded = (id: number) => expandedEvents.has(id);
  const toggleExpand = (id: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            <Shield className="w-6 h-6 inline-block mr-2" />
            {t.store.systemHealth}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t.store.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            {t.store.checking} (30s)
          </label>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t.common.refresh}
          </button>
          <button
            onClick={() => setShowBlockModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {t.store.install}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.store.criticalEvents}</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{data?.stats.criticalEvents || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.store.warningEvents}</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data?.stats.warningEvents || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.store.blockedIps}</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data?.stats.blockedIps || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.store.failedAttempts}</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{data?.stats.failedAttempts || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <Terminal className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.store.totalAttempts}</p>
              <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{data?.stats.totalAttempts || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingDown className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Success Rate</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {data && data.stats.totalAttempts > 0
                  ? `${(((data.stats.totalAttempts - data.stats.failedAttempts) / data.stats.totalAttempts) * 100).toFixed(1)}%`
                  : '100%'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Attackers & Blocked IPs */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Attacker IPs */}
        <Card>
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Top Penyerang (24 Jam)
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {data?.stats.topAttackerIps.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Tidak ada aktivitas mencurigakan</p>
              </div>
            ) : (
              data?.stats.topAttackerIps.slice(0, 10).map((attacker, index) => (
                <div key={attacker.ip} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-4">
                  <span className="w-8 text-center text-slate-400 font-mono text-sm">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">{attacker.ip}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{attacker.attempts} {t.store.failedAttempts}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                        Threat: {attacker.threatScore}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setBlockForm({ ip: attacker.ip, reason: `Auto-block: ${attacker.attempts} percobaan gagal`, permanent: false });
                      setShowBlockModal(true);
                    }}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    {t.store.install}
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Blocked IPs */}
        <Card>
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              IP Terblokir
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {data?.blockedIps.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <Unlock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Tidak ada IP yang diblokir</p>
              </div>
            ) : (
              data?.blockedIps.slice(0, 10).map((blocked) => (
                <div key={blocked.ip_address} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">{blocked.ip_address}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="truncate max-w-xs">{blocked.reason}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium">
                        {blocked.is_permanent ? (
                          <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Permanen</span>
                        ) : blocked.expires_at ? (
                          <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                            Berakhir: {new Date(blocked.expires_at).toLocaleDateString('id-ID')}
                          </span>
                        ) : (
                          <span className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">Aktif</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblockIp(blocked.ip_address)}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    <Unlock className="w-4 h-4 inline mr-1" />
                    {t.store.uninstall}
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Security Events */}
      <Card>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Kejadian Keamanan Terbaru
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={t.store.search}
              className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-64"
            />
          </div>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {data?.events.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Belum ada kejadian keamanan</p>
            </div>
          ) : (
            data?.events.slice(0, 50).map((event) => (
              <div
                key={event.id}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                onClick={() => toggleExpand(event.id)}
              >
                <div className="flex items-start gap-4">
                  <div className={cn('p-2 rounded-lg flex-shrink-0', getSeverityColor(event.severity))}>
                    {getSeverityIcon(event.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{event.event_type}</span>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getSeverityColor(event.severity))}>
                        {event.severity.toUpperCase()}
                      </span>
                      {event.ip_address && (
                        <span className="font-mono text-sm text-slate-600 dark:text-slate-400">{event.ip_address}</span>
                      )}
                      {event.username && (
                        <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {event.username}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 ml-auto">{formatDate(event.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{event.details}</p>
                  </div>
                  <button
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEvent(event);
                    }}
                  >
                    {isExpanded(event.id) ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {isExpanded(event.id) && (
                  <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 animate-slide-down">
                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Event Type</p>
                        <p className="font-mono text-slate-900 dark:text-slate-100">{event.event_type}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Severity</p>
                        <p className={cn('font-medium', getSeverityColor(event.severity).replace('bg-', '').replace('dark:bg-', ''))}>
                          {event.severity}
                        </p>
                      </div>
                      {event.ip_address && (
                        <div className="sm:col-span-2">
                          <p className="text-slate-500 dark:text-slate-400">IP Address</p>
                          <p className="font-mono text-slate-900 dark:text-slate-100">{event.ip_address}</p>
                        </div>
                      )}
                      {event.username && (
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Username</p>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{event.username}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Timestamp</p>
                        <p className="font-mono text-slate-900 dark:text-slate-100">{formatDate(event.created_at)}</p>
                      </div>
                      {event.raw_data && (
                        <div className="sm:col-span-2">
                          <p className="text-slate-500 dark:text-slate-400">Raw Data</p>
                          <pre className="mt-1 p-3 bg-slate-100 dark:bg-slate-900 rounded text-xs overflow-x-auto font-mono text-slate-700 dark:text-slate-300 max-h-48">
                            {JSON.stringify(JSON.parse(event.raw_data), null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Block IP Modal */}
      <Modal
        open={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        title={t.store.install}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              IP Address
            </label>
            <input
              type="text"
              value={blockForm.ip}
              onChange={(e) => setBlockForm({ ...blockForm, ip: e.target.value })}
              placeholder="192.168.1.100"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Alasan
            </label>
            <textarea
              value={blockForm.reason}
              onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
              placeholder="Alasan pemblokiran..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="permanent"
              checked={blockForm.permanent}
              onChange={(e) => setBlockForm({ ...blockForm, permanent: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="permanent" className="text-sm text-slate-700 dark:text-slate-300">
              Blokir permanen (tidak kedaluwarsa)
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowBlockModal(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleBlockIp}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Lock className="w-4 h-4 inline mr-1" />
              {t.store.install}
            </button>
          </div>
        </div>
      </Modal>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <Modal
          open={true}
          onClose={() => setSelectedEvent(null)}
          title="Detail Kejadian"
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Event Type</p>
                <p className="font-mono text-slate-900 dark:text-slate-100">{selectedEvent.event_type}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Severity</p>
                <p className={cn('font-medium', getSeverityColor(selectedEvent.severity).replace('bg-', '').replace('dark:bg-', ''))}>
                  {selectedEvent.severity.toUpperCase()}
                </p>
              </div>
              {selectedEvent.ip_address && (
                <div className="sm:col-span-2">
                  <p className="text-slate-500 dark:text-slate-400 text-sm">IP Address</p>
                  <p className="font-mono text-slate-900 dark:text-slate-100">{selectedEvent.ip_address}</p>
                </div>
              )}
              {selectedEvent.username && (
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Username</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{selectedEvent.username}</p>
                </div>
              )}
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Timestamp</p>
                <p className="font-mono text-slate-900 dark:text-slate-100">{formatDate(selectedEvent.created_at)}</p>
              </div>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Details</p>
              <p className="text-slate-900 dark:text-slate-100 mt-1">{selectedEvent.details}</p>
            </div>
            {selectedEvent.raw_data && (
              <div>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Raw Data</p>
                <pre className="mt-1 p-3 bg-slate-100 dark:bg-slate-900 rounded text-xs overflow-x-auto font-mono text-slate-700 dark:text-slate-300 max-h-64">
                  {JSON.stringify(JSON.parse(selectedEvent.raw_data), null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}