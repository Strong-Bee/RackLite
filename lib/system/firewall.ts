import { findBinary, runSystemCommand } from '@/lib/system/exec';
import { IP_CIDR_REGEX, isValidPortSpec } from '@/lib/security';
import type { OpenPortInfo } from '@/types/panel';

export async function getOpenListeningPorts(): Promise<OpenPortInfo[]> {
  const res = await runSystemCommand('ss', ['-tulnp']);
  if (!res.ok) return [];

  const lines = res.stdout.trim().split('\n').slice(1);
  const ports: OpenPortInfo[] = [];

  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const protocol = cols[0];
    const localAddr = cols[4] || '';
    const lastColon = localAddr.lastIndexOf(':');
    const port = lastColon >= 0 ? localAddr.slice(lastColon + 1) : localAddr;
    const addr = lastColon >= 0 ? localAddr.slice(0, lastColon) : localAddr;
    const procPart = cols.slice(6).join(' ');
    const procMatch = /"([^"]+)"/.exec(procPart);
    ports.push({
      protocol,
      localAddress: addr || '*',
      port,
      process: procMatch ? procMatch[1] : procPart || '-',
    });
  }
  return ports;
}

export async function getUfwStatusSummary(): Promise<{
  available: boolean;
  active: boolean;
  rawOutput: string;
}> {
  const ufw = await findBinary('ufw');
  if (!ufw) {
    return {
      available: false,
      active: false,
      rawOutput: 'Biner ufw belum terpasang di sistem ini.',
    };
  }
  const res = await runSystemCommand('ufw', ['status', 'numbered']);
  const out = res.stdout || res.stderr;
  return {
    available: true,
    active: /Status:\s+active/i.test(out),
    rawOutput: out,
  };
}

export async function applyUfwRule(params: {
  port: string;
  protocol: 'tcp' | 'udp' | 'any';
  action: 'allow' | 'deny';
  sourceIp: string;
}): Promise<{ ok: boolean; executedOnUfw: boolean; message: string }> {
  if (!isValidPortSpec(params.port)) {
    return { ok: false, executedOnUfw: false, message: 'Nomor port tidak valid.' };
  }
  if (!IP_CIDR_REGEX.test(params.sourceIp)) {
    return { ok: false, executedOnUfw: false, message: 'Format IP/CIDR tidak valid.' };
  }

  const ufw = await findBinary('ufw');
  if (!ufw) {
    return {
      ok: true,
      executedOnUfw: false,
      message: 'Aturan dicatat dalam kebijakan panel (ufw tidak terpasang di host ini).',
    };
  }

  const portSpec =
    params.protocol === 'any' ? params.port : `${params.port}/${params.protocol}`;

  const args =
    params.sourceIp === 'any' || params.sourceIp === '0.0.0.0/0'
      ? [params.action, portSpec]
      : [params.action, 'from', params.sourceIp, 'to', 'any', 'port', params.port];

  if (params.sourceIp !== 'any' && params.protocol !== 'any') {
    args.push('proto', params.protocol);
  }

  const res = await runSystemCommand('ufw', args);
  if (!res.ok) {
    return {
      ok: false,
      executedOnUfw: false,
      message: res.stderr || 'Gagal menerapkan aturan UFW.',
    };
  }
  return {
    ok: true,
    executedOnUfw: true,
    message: `Aturan UFW (${params.action} ${portSpec}) berhasil diterapkan.`,
  };
}

export async function deleteUfwRule(params: {
  port: string;
  protocol: 'tcp' | 'udp' | 'any';
  action: 'allow' | 'deny';
  sourceIp: string;
}): Promise<{ ok: boolean; message: string }> {
  const ufw = await findBinary('ufw');
  if (!ufw) {
    return { ok: true, message: 'Aturan dihapus dari daftar panel.' };
  }
  const portSpec =
    params.protocol === 'any' ? params.port : `${params.port}/${params.protocol}`;
  const args =
    params.sourceIp === 'any' || params.sourceIp === '0.0.0.0/0'
      ? ['delete', params.action, portSpec]
      : ['delete', params.action, 'from', params.sourceIp, 'to', 'any', 'port', params.port];
  const res = await runSystemCommand('ufw', args);
  return {
    ok: true,
    message: res.ok
      ? `Aturan UFW dihapus.`
      : `Dihapus dari panel (${res.stderr.trim()}).`,
  };
}
