import fs from 'node:fs/promises';
import os from 'node:os';
import { runSystemCommand } from '@/lib/system/exec';
import type { SystemMetrics } from '@/types/panel';

// Simpan snapshot sebelumnya untuk menghitung persentase CPU & kecepatan jaringan realtime
let prevCpuSample: { idle: number; total: number } | null = null;
let prevNetSample: {
  timestamp: number;
  rxBytes: number;
  txBytes: number;
} | null = null;

async function readCpuUsagePercent(): Promise<number> {
  try {
    const stat = await fs.readFile('/proc/stat', 'utf8');
    const firstLine = stat.split('\n')[0];
    const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);
    if (parts.length < 4) return 0;

    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((acc, val) => acc + (Number.isFinite(val) ? val : 0), 0);

    if (!prevCpuSample) {
      prevCpuSample = { idle, total };
      // Hitung estimasi awal dari loadavg jika belum ada 2 sampel
      const load1 = os.loadavg()[0] || 0;
      const cores = os.cpus().length || 1;
      return Math.min(100, Math.round((load1 / cores) * 1000) / 10);
    }

    const diffIdle = idle - prevCpuSample.idle;
    const diffTotal = total - prevCpuSample.total;
    prevCpuSample = { idle, total };

    if (diffTotal <= 0) return 0;
    const usage = ((diffTotal - diffIdle) / diffTotal) * 100;
    return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
  } catch {
    return 0;
  }
}

async function readMemoryInfo() {
  try {
    const raw = await fs.readFile('/proc/meminfo', 'utf8');
    const map = new Map<string, number>();
    for (const line of raw.split('\n')) {
      const m = /^(\w+):\s+(\d+)\s+kB/.exec(line);
      if (m) map.set(m[1], Number(m[2]) * 1024);
    }
    const total = map.get('MemTotal') || os.totalmem();
    const available = map.get('MemAvailable') ?? map.get('MemFree') ?? os.freemem();
    const free = map.get('MemFree') ?? available;
    const used = Math.max(0, total - available);
    const swapTotal = map.get('SwapTotal') || 0;
    const swapFree = map.get('SwapFree') || 0;
    const swapUsed = Math.max(0, swapTotal - swapFree);

    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      availableBytes: available,
      usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
      swapTotalBytes: swapTotal,
      swapUsedBytes: swapUsed,
      swapPercent: swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0,
    };
  } catch {
    const total = os.totalmem();
    const free = os.freemem();
    const used = Math.max(0, total - free);
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      availableBytes: free,
      usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
      swapPercent: 0,
    };
  }
}

async function readNetworkStats() {
  const interfaces: Array<{ name: string; rxBytes: number; txBytes: number }> = [];
  let totalRxBytes = 0;
  let totalTxBytes = 0;

  try {
    const raw = await fs.readFile('/proc/net/dev', 'utf8');
    const lines = raw.split('\n').slice(2);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes(':')) continue;
      const [ifacePart, statsPart] = trimmed.split(':');
      const name = ifacePart.trim();
      if (name === 'lo') continue;
      const cols = statsPart.trim().split(/\s+/).map(Number);
      if (cols.length >= 9) {
        const rx = cols[0] || 0;
        const tx = cols[8] || 0;
        interfaces.push({ name, rxBytes: rx, txBytes: tx });
        totalRxBytes += rx;
        totalTxBytes += tx;
      }
    }
  } catch {
    // Abaikan jika /proc/net/dev tidak dapat diakses
  }

  const now = Date.now();
  let rxBytesPerSec = 0;
  let txBytesPerSec = 0;
  if (prevNetSample) {
    const dtSec = Math.max(0.5, (now - prevNetSample.timestamp) / 1000);
    rxBytesPerSec = Math.max(0, Math.round((totalRxBytes - prevNetSample.rxBytes) / dtSec));
    txBytesPerSec = Math.max(0, Math.round((totalTxBytes - prevNetSample.txBytes) / dtSec));
  }
  prevNetSample = { timestamp: now, rxBytes: totalRxBytes, txBytes: totalTxBytes };

  return {
    rxBytesPerSec,
    txBytesPerSec,
    totalRxBytes,
    totalTxBytes,
    interfaces,
  };
}

async function readDiskUsage() {
  const res = await runSystemCommand('df', ['-B1', '-P', '-x', 'tmpfs', '-x', 'devtmpfs']);
  if (!res.ok) return [];
  const lines = res.stdout.trim().split('\n').slice(1);
  const disks: SystemMetrics['disks'] = [];
  const seenMounts = new Set<string>();

  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 6) continue;
    const filesystem = cols[0];
    const totalBytes = Number(cols[1]) || 0;
    const usedBytes = Number(cols[2]) || 0;
    const availableBytes = Number(cols[3]) || 0;
    const mount = cols.slice(5).join(' ');
    if (totalBytes === 0 || seenMounts.has(mount)) continue;
    seenMounts.add(mount);
    disks.push({
      filesystem,
      mount,
      totalBytes,
      usedBytes,
      availableBytes,
      usagePercent: Math.round((usedBytes / totalBytes) * 1000) / 10,
    });
  }
  return disks;
}

async function readTopProcesses() {
  const res = await runSystemCommand('ps', [
    '-eo',
    'pid,user,%cpu,%mem,comm',
    '--sort=-%cpu',
  ]);
  if (!res.ok) return [];
  const lines = res.stdout.trim().split('\n').slice(1, 13);
  const procs: SystemMetrics['processes'] = [];
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    procs.push({
      pid: Number(cols[0]) || 0,
      user: cols[1],
      cpu: Number(cols[2]) || 0,
      mem: Number(cols[3]) || 0,
      command: cols.slice(4).join(' '),
    });
  }
  return procs;
}

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const [cpuUsagePercent, memory, network, disks, processes] = await Promise.all([
    readCpuUsagePercent(),
    readMemoryInfo(),
    readNetworkStats(),
    readDiskUsage(),
    readTopProcesses(),
  ]);

  const cpus = os.cpus();
  const load = os.loadavg();
  const rssMb = Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;

  return {
    timestamp: Date.now(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.arch()}`,
    kernel: os.release(),
    uptimeSeconds: Math.floor(os.uptime()),
    cpu: {
      cores: cpus.length || 1,
      model: cpus[0]?.model || 'Linux CPU',
      usagePercent: cpuUsagePercent,
      loadAvg: [
        Math.round((load[0] || 0) * 100) / 100,
        Math.round((load[1] || 0) * 100) / 100,
        Math.round((load[2] || 0) * 100) / 100,
      ],
    },
    memory,
    disks,
    network,
    processes,
    panelRssMb: rssMb,
  };
}
