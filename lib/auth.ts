import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SessionPayload, UserRole } from '@/types/panel';
import { getDataDir } from '@/lib/db';

export const SESSION_COOKIE_NAME = 'racklite_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 jam

let cachedSecret: Uint8Array | null = null;

/**
 * Ambil secret JWT dari environment atau berkas lokal terproteksi agar tidak hardcode.
 */
export function getJwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const envSecret = process.env.PANEL_JWT_SECRET;
  if (envSecret && envSecret.length >= 24 && !envSecret.includes('change-this')) {
    cachedSecret = new TextEncoder().encode(envSecret);
    return cachedSecret;
  }

  const secretFile = path.join(getDataDir(), '.jwt-secret');
  let secretStr = '';
  if (fs.existsSync(secretFile)) {
    secretStr = fs.readFileSync(secretFile, 'utf8').trim();
  }
  if (secretStr.length < 32) {
    secretStr = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, secretStr, { mode: 0o600 });
  }
  cachedSecret = new TextEncoder().encode(secretStr);
  return cachedSecret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSessionToken(payload: {
  userId: number;
  username: string;
  role: UserRole;
}): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    username: payload.username,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    });
    if (
      typeof payload.userId !== 'number' ||
      typeof payload.username !== 'string' ||
      (payload.role !== 'admin' && payload.role !== 'user')
    ) {
      return null;
    }
    return {
      sub: String(payload.sub || payload.userId),
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function buildSessionCookieOptions(isHttps: boolean) {
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
  };
}

// Rate limiter login ringan di memori (maksimal 5 percobaan gagal per 5 menit)
interface RateEntry {
  count: number;
  resetAt: number;
}
const loginAttempts = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

export function checkLoginRateLimit(key: string): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  // Bersihkan entri kedaluwarsa secara berkala agar RAM tetap hemat
  if (loginAttempts.size > 500) {
    for (const [k, v] of loginAttempts.entries()) {
      if (v.resetAt <= now) loginAttempts.delete(k);
    }
  }
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}

// Helper TOTP 2FA (RFC 6238)
export function generateTotpSetup(username: string): {
  secret: string;
  uri: string;
} {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'RackLite Panel',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export async function generateTotpQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, {
    width: 200,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'RackLite Panel',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });
    const delta = totp.validate({ token: code.trim(), window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}
