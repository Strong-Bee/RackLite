import fs from 'node:fs/promises';
import path from 'node:path';
import { getDataDir } from '@/lib/db';

export type LogSourceId = 'panel' | 'nginx-access' | 'nginx-error' | 'syslog';

export function getLogSourcePath(source: LogSourceId): string {
  const dataDir = getDataDir();
  switch (source) {
    case 'panel':
      return path.join(dataDir, 'logs', 'panel.log');
    case 'nginx-access':
      return '/var/log/nginx/access.log';
    case 'nginx-error':
      return '/var/log/nginx/error.log';
    case 'syslog':
      return '/var/log/syslog';
    default:
      return path.join(dataDir, 'logs', 'panel.log');
  }
}

export async function readLogTail(params: {
  source: LogSourceId;
  lines?: number;
  filter?: string;
}): Promise<{
  source: LogSourceId;
  path: string;
  available: boolean;
  lines: string[];
  message?: string;
}> {
  const filePath = getLogSourcePath(params.source);
  const maxLines = Math.min(Math.max(10, params.lines ?? 150), 1000);
  const query = (params.filter || '').trim().toLowerCase();

  try {
    const stat = await fs.stat(filePath);
    // Baca maksimal 512 KB terakhir agar RAM tetap sangat rendah meski log berukuran GB
    const readSize = Math.min(stat.size, 512 * 1024);
    const fd = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(readSize);
      await fd.read(buf, 0, readSize, Math.max(0, stat.size - readSize));
      let rawLines = buf.toString('utf8').split('\n').filter(Boolean);
      if (query) {
        rawLines = rawLines.filter((line) => line.toLowerCase().includes(query));
      }
      return {
        source: params.source,
        path: filePath,
        available: true,
        lines: rawLines.slice(-maxLines),
      };
    } finally {
      await fd.close();
    }
  } catch (err) {
    return {
      source: params.source,
      path: filePath,
      available: false,
      lines: [],
      message:
        err instanceof Error
          ? `Berkas log belum tersedia atau tidak dapat dibaca (${err.message}).`
          : 'Berkas log tidak dapat dibaca.',
    };
  }
}
