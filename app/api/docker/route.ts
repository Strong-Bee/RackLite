import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runSystemCommand } from '@/lib/system/exec';
import { recordAudit, requireAuth } from '@/lib/api-guard';

const DockerActionSchema = z.object({
  type: z.enum(['container', 'image']),
  action: z.enum(['start', 'stop', 'restart', 'remove', 'pull']),
  id: z.string().trim().min(1).optional(),
});

async function checkDockerAvailable(): Promise<boolean> {
  const res = await runSystemCommand('docker', ['version', '--format', '{{.Server.Version}}']);
  return res.ok && res.stdout.trim().length > 0;
}

async function getContainers(): Promise<Array<{
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: Array<{ IP: string; PublicPort: number; PrivatePort: number; Type: string }> | null;
  created: number;
  labels: Record<string, string>;
}>> {
  const res = await runSystemCommand('docker', [
    'ps',
    '-a',
    '--format',
    '{{json .}}',
  ]);
  if (!res.ok) return [];

  const containers = [];
  for (const line of res.stdout.trim().split('\n')) {
    if (!line.trim()) continue;
    try {
      const c = JSON.parse(line);
      containers.push({
        id: c.ID || c.Id || '',
        name: c.Names || c.Name || '',
        image: c.Image || '',
        status: c.Status || '',
        state: c.State || '',
        ports: c.Ports ? parsePorts(c.Ports) : null,
        created: parseCreated(c.CreatedAt || c.Created || '0'),
        labels: c.Labels ? parseLabels(c.Labels) : {},
      });
    } catch {
      // Skip malformed lines
    }
  }
  return containers;
}

async function getImages(): Promise<Array<{
  id: string;
  repository: string;
  tag: string;
  size: number;
  created: number;
  labels: Record<string, string>;
}>> {
  const res = await runSystemCommand('docker', [
    'images',
    '--format',
    '{{json .}}',
  ]);
  if (!res.ok) return [];

  const images = [];
  for (const line of res.stdout.trim().split('\n')) {
    if (!line.trim()) continue;
    try {
      const i = JSON.parse(line);
      images.push({
        id: i.ID || i.Id || '',
        repository: i.Repository || '<none>',
        tag: i.Tag || '<none>',
        size: parseSize(i.Size || '0B'),
        created: parseCreated(i.CreatedAt || i.Created || i.CreatedSince || '0'),
        labels: i.Labels ? parseLabels(i.Labels) : {},
      });
    } catch {
      // Skip malformed lines
    }
  }
  return images;
}

function parsePorts(portsStr: string): Array<{ IP: string; PublicPort: number; PrivatePort: number; Type: string }> {
  // docker ps --format ports output format: "0.0.0.0:8080->80/tcp, :::8080->80/tcp"
  const result = [];
  for (const part of portsStr.split(',')) {
    const trimmed = part.trim();
    const match = trimmed.match(/^([^:]+):(\d+)->(\d+)\/(\w+)$/);
    if (match) {
      result.push({
        IP: match[1],
        PublicPort: Number(match[2]),
        PrivatePort: Number(match[3]),
        Type: match[4],
      });
    }
  }
  return result;
}

function parseLabels(labelsStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of labelsStr.split(',')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    }
  }
  return result;
}

function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^([\d.]+)\s*(\w+)$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024,
  };
  return Math.round(value * (multipliers[unit] || 1));
}

function parseCreated(createdStr: string): number {
  // Try parsing as timestamp first
  const num = Number(createdStr);
  if (!isNaN(num) && num > 1000000000) return num;

  // Try parsing as date string
  const date = new Date(createdStr);
  if (!isNaN(date.getTime())) return Math.floor(date.getTime() / 1000);

  // Try relative format like "2 hours ago"
  const relative = createdStr.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  if (relative) {
    const value = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const seconds: Record<string, number> = {
      second: 1,
      minute: 60,
      hour: 3600,
      day: 86400,
      week: 604800,
      month: 2592000,
      year: 31536000,
    };
    return Math.floor(Date.now() / 1000) - value * (seconds[unit] || 0);
  }

  return Math.floor(Date.now() / 1000);
}

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const logsId = searchParams.get('logs');
  const inspectType = searchParams.get('inspect');
  const inspectId = searchParams.get('id');

  const available = await checkDockerAvailable();

  if (logsId) {
    const res = await runSystemCommand('docker', ['logs', '--tail', '500', logsId]);
    return NextResponse.json({ logs: res.ok ? res.stdout : res.stderr || 'Gagal mengambil log' });
  }

  if (inspectType && inspectId) {
    const res = await runSystemCommand('docker', ['inspect', inspectId]);
    if (!res.ok) return NextResponse.json({ data: null, error: res.stderr });
    try {
      const data = JSON.parse(res.stdout);
      return NextResponse.json({ data: data[0] });
    } catch {
      return NextResponse.json({ data: null, error: 'Gagal parse inspect output' });
    }
  }

  if (type === 'containers') {
    const containers = await getContainers();
    return NextResponse.json({ available, containers });
  }

  if (type === 'images') {
    const images = await getImages();
    return NextResponse.json({ available, images });
  }

  // Default: return both
  const [containers, images] = await Promise.all([getContainers(), getImages()]);
  return NextResponse.json({ available, containers, images });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const available = await checkDockerAvailable();
  if (!available) {
    return NextResponse.json({ error: 'Docker tidak tersedia di server ini.' }, { status: 503 });
  }

  const parsed = DockerActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Aksi tidak valid.' },
      { status: 400 }
    );
  }

  const { type, action, id } = parsed.data;

  try {
    let result: { ok: boolean; stdout: string; stderr: string; code: number | null };
    let message = '';

    if (type === 'container') {
      if (!id) return NextResponse.json({ error: 'Container ID wajib diisi.' }, { status: 400 });

      switch (action) {
        case 'start':
          result = await runSystemCommand('docker', ['start', id]);
          message = `Container ${id} berhasil distart.`;
          break;
        case 'stop':
          result = await runSystemCommand('docker', ['stop', id]);
          message = `Container ${id} berhasil dihentikan.`;
          break;
        case 'restart':
          result = await runSystemCommand('docker', ['restart', id]);
          message = `Container ${id} berhasil direstart.`;
          break;
        case 'remove':
          result = await runSystemCommand('docker', ['rm', '-f', id]);
          message = `Container ${id} berhasil dihapus.`;
          break;
        default:
          return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
      }
    } else if (type === 'image') {
      if (action === 'pull') {
        if (!id) return NextResponse.json({ error: 'Nama image wajib diisi.' }, { status: 400 });
        result = await runSystemCommand('docker', ['pull', id]);
        message = `Image ${id} berhasil di-pull.`;
      } else if (action === 'remove') {
        if (!id) return NextResponse.json({ error: 'Image ID wajib diisi.' }, { status: 400 });
        result = await runSystemCommand('docker', ['rmi', '-f', id]);
        message = `Image ${id} berhasil dihapus.`;
      } else {
        return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Tipe tidak valid.' }, { status: 400 });
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.stderr || 'Perintah Docker gagal.' },
        { status: 500 }
      );
    }

    recordAudit({
      userId: guard.session.userId,
      username: guard.session.username,
      action: `DOCKER_${type.toUpperCase()}_${action.toUpperCase()}`,
      target: `${type}:${id || ''}`,
      status: 'success',
      detail: message,
      ip: guard.ip,
    });

    return NextResponse.json({ ok: true, message });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: `Terjadi kesalahan: ${error.message}` }, { status: 500 });
  }
}