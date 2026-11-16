import fs from 'node:fs/promises';
import os from 'node:os';
import { runSystemCommand } from '@/lib/system/exec';
import type { SystemMetrics } from '@/types/panel';

const isWindows = os.platform() === 'win32';

// Simpan snapshot sebelumnya untuk menghitung persentase CPU & kecepatan jaringan realtime
let prevCpuSample: { idle: number; total: number } | null = null;
let prevNetSample: {
  timestamp: number;
  rxBytes: number;
  txBytes: number;
} | null = null;

async function readCpuUsagePercent(): Promise<number> {
  if (isWindows) {
    return readCpuUsagePercentWindows();
  }
  try {
    const stat = await fs.readFile('/proc/stat', 'utf8');
    const firstLine = stat.split('\n')[0];
    const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);
    if (parts.length < 4) return 0;

    const idle = parts[3] + (parts[4] || 0);
    const total = parts.reduce((acc, val) => acc + (Number.isFinite(val) ? val : 0), 0);

    if (!prevCpuSample) {
      prevCpuSample = { idle, total };
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

async function readCpuUsagePercentWindows(): Promise<number> {
  try {
    // Use PowerShell for more accurate CPU usage on Windows
    const res = await runSystemCommand('powershell', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average',
    ]);
    if (res.ok && res.stdout.trim()) {
      const avg = Number(res.stdout.trim());
      if (!isNaN(avg) && avg >= 0 && avg <= 100) {
        return Math.round(avg * 10) / 10;
      }
    }
  } catch {
    // fallback to wmic
  }
  try {
    const res = await runSystemCommand('wmic', [
      'cpu',
      'get',
      'LoadPercentage',
      '/value',
    ]);
    if (!res.ok) return 0;
    const match = res.stdout.match(/LoadPercentage=(\d+)/);
    if (match) return Math.min(100, Number(match[1]));
  } catch {
    // fallback
  }
  const load1 = os.loadavg()[0] || 0;
  const cores = os.cpus().length || 1;
  return Math.min(100, Math.round((load1 / cores) * 1000) / 10);
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
  if (isWindows) {
    return readNetworkStatsWindows();
  }
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

async function readNetworkStatsWindows() {
  const interfaces: Array<{ name: string; rxBytes: number; txBytes: number }> = [];
  let totalRxBytes = 0;
  let totalTxBytes = 0;

  try {
    const res = await runSystemCommand('powershell', [
      '-NoProfile',
      '-Command',
      'Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes | ConvertTo-Json',
    ]);
    if (res.ok && res.stdout.trim()) {
      const adapters = JSON.parse(res.stdout);
      const arr = Array.isArray(adapters) ? adapters : [adapters];
      for (const adapter of arr) {
        if (adapter.Name && adapter.ReceivedBytes !== undefined && adapter.SentBytes !== undefined) {
          const rx = Number(adapter.ReceivedBytes) || 0;
          const tx = Number(adapter.SentBytes) || 0;
          interfaces.push({ name: adapter.Name, rxBytes: rx, txBytes: tx });
          totalRxBytes += rx;
          totalTxBytes += tx;
        }
      }
    }
  } catch {
    // Fallback
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
  if (isWindows) {
    return readDiskUsageWindows();
  }
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

async function readDiskUsageWindows(): Promise<SystemMetrics['disks']> {
  try {
    const res = await runSystemCommand('powershell', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,Size,FreeSpace,VolumeName | ConvertTo-Json',
    ]);
    if (!res.ok || !res.stdout.trim()) return [];

    const disks: SystemMetrics['disks'] = [];
    const drives = JSON.parse(res.stdout);
    const arr = Array.isArray(drives) ? drives : [drives];
    for (const drive of arr) {
      if (drive.DeviceID && drive.Size !== undefined) {
        const totalBytes = Number(drive.Size) || 0;
        const freeBytes = Number(drive.FreeSpace) || 0;
        const usedBytes = Math.max(0, totalBytes - freeBytes);
        if (totalBytes > 0) {
          disks.push({
            filesystem: drive.VolumeName || drive.DeviceID,
            mount: drive.DeviceID,
            totalBytes,
            usedBytes,
            availableBytes: freeBytes,
            usagePercent: Math.round((usedBytes / totalBytes) * 1000) / 10,
          });
        }
      }
    }
    return disks;
  } catch {
    return [];
  }
}

async function readTopProcesses() {
  if (isWindows) {
    return readTopProcessesWindows();
  }
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

async function readTopProcessesWindows(): Promise<SystemMetrics['processes']> {
  try {
    const res = await runSystemCommand('powershell', [
      '-NoProfile',
      '-Command',
      'Get-Process | Sort-Object CPU -Descending | Select-Object -First 12 Id,ProcessName,CPU,WS | ConvertTo-Json',
    ]);
    if (!res.ok || !res.stdout.trim()) return [];

    const procs = JSON.parse(res.stdout);
    const arr = Array.isArray(procs) ? procs : [procs];
    const result: SystemMetrics['processes'] = [];
    for (const p of arr) {
      if (p.Id && p.ProcessName) {
        result.push({
          pid: Number(p.Id) || 0,
          user: 'SYSTEM',
          cpu: Number(p.CPU) || 0,
          mem: Math.round((Number(p.WS) || 0) / 1024 / 1024 * 100) / 100,
          command: p.ProcessName,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
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
