import type { NextRequest } from 'next/server';

// Pola regex ketat untuk sanitasi seluruh input sistem
export const USERNAME_REGEX = /^[a-z_][a-z0-9_-]{1,31}$/;
export const DOMAIN_REGEX =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;
export const DB_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{1,48}$/;
export const SERVICE_NAME_REGEX = /^[a-zA-Z0-9._@-]{1,64}$/;
export const CHMOD_REGEX = /^[0-7]{3,4}$/;
export const PORT_RANGE_REGEX = /^(\d{1,5})(:\d{1,5})?$/;
export const IP_CIDR_REGEX =
  /^(any|0\.0\.0\.0\/0|(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?|[a-fA-F0-9:]+(\/\d{1,3})?)$/;

/**
 * Ekstrak alamat IP klien dengan aman dari header proxy atau koneksi langsung.
 */
export function getClientIp(req: Request | NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return '127.0.0.1';
}

/**
 * Validasi CSRF berbasis Origin / Referer dan Sec-Fetch-Site agar aman di balik reverse proxy.
 */
export function verifyCsrfOrigin(req: Request | NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const secFetchSite = req.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return false;
  }
  if (secFetchSite === 'same-origin') {
    return true;
  }

  const allowedHosts = new Set<string>();
  const host = req.headers.get('host');
  if (host) allowedHosts.add(host.toLowerCase());

  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    for (const h of forwardedHost.split(',')) {
      const clean = h.trim().toLowerCase();
      if (clean) allowedHosts.add(clean);
    }
  }

  if (process.env.APP_URL) {
    try {
      allowedHosts.add(new URL(process.env.APP_URL).host.toLowerCase());
    } catch {
      // Abaikan jika APP_URL bukan URL valid
    }
  }

  if (allowedHosts.size === 0) return false;

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      return allowedHosts.has(originHost);
    } catch {
      return false;
    }
  }

  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      return allowedHosts.has(refererHost);
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Konversi IPv4 ke integer 32-bit untuk pengecekan CIDR sederhana.
 */
function ipv4ToInt(ip: string): number | null {
  const clean = ip.replace(/^::ffff:/, '');
  const parts = clean.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  return num >>> 0;
}

/**
 * Cek apakah IP klien diizinkan oleh daftar IP whitelist (dipisah koma).
 */
export function isIpAllowed(clientIp: string, whitelistRaw: string): boolean {
  const trimmed = whitelistRaw.trim();
  if (!trimmed) return true; // Kosong berarti semua IP diizinkan

  const cleanIp = clientIp.replace(/^::ffff:/, '').trim();
  // Loopback selalu diizinkan agar panel tidak mengunci diri sendiri di localhost
  if (cleanIp === '127.0.0.1' || cleanIp === '::1') return true;

  const entries = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (entries.length === 0) return true;

  const clientInt = ipv4ToInt(cleanIp);

  for (const entry of entries) {
    if (entry === cleanIp || entry === '*') return true;
    if (entry.includes('/') && clientInt !== null) {
      const [network, prefixStr] = entry.split('/');
      const prefix = Number(prefixStr);
      const netInt = ipv4ToInt(network);
      if (netInt !== null && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32) {
        const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
        if ((clientInt & mask) === (netInt & mask)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Validasi nomor port valid (1..65535) atau rentang port (start:end).
 */
export function isValidPortSpec(portSpec: string): boolean {
  const match = PORT_RANGE_REGEX.exec(portSpec.trim());
  if (!match) return false;
  const p1 = Number(match[1]);
  if (p1 < 1 || p1 > 65535) return false;
  if (match[2]) {
    const p2 = Number(match[2].slice(1));
    if (p2 < 1 || p2 > 65535 || p2 <= p1) return false;
  }
  return true;
}
