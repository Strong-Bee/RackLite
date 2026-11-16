import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import {
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
  signSessionToken,
  verifyPassword,
  verifyTotpCode,
} from '@/lib/auth';
import { getClientIp, isIpAllowed, verifyCsrfOrigin } from '@/lib/security';
import { recordAudit } from '@/lib/api-guard';
import { recordLoginAttempt, isIpBlocked } from '@/lib/system/security';
import type { UserRole } from '@/types/panel';

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  totpCode: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const db = getDb();

  if (!verifyCsrfOrigin(req)) {
    return NextResponse.json(
      { error: 'Validasi CSRF gagal.' },
      { status: 403 }
    );
  }

  const whitelistRow = db
    .prepare("SELECT value FROM settings WHERE key = 'ip_whitelist'")
    .get() as { value: string } | undefined;
  if (whitelistRow && !isIpAllowed(ip, whitelistRow.value)) {
    return NextResponse.json(
      { error: 'IP Anda tidak diizinkan mengakses panel ini.' },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload JSON tidak valid.' }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Username dan kata sandi wajib diisi.' },
      { status: 400 }
    );
  }

  const username = parsed.data.username.toLowerCase();
  const rateKey = `${ip}:${username}`;

  // Check if IP is blocked by security system
  const blockCheck = isIpBlocked(ip);
  if (blockCheck.blocked) {
    await recordLoginAttempt({
      ipAddress: ip,
      username,
      success: false,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json(
      { error: `Akses diblokir: ${blockCheck.reason}${blockCheck.expiresAt ? ` (berakhir: ${blockCheck.expiresAt})` : ' (permanen)'}` },
      { status: 403 }
    );
  }
  const rateCheck = checkLoginRateLimit(rateKey);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${rateCheck.retryAfterSec} detik.`,
      },
      { status: 429 }
    );
  }

  const user = db
    .prepare(
      'SELECT id, username, password_hash, role, totp_secret, totp_enabled, is_active FROM users WHERE username = ?'
    )
    .get(username) as
    | {
        id: number;
        username: string;
        password_hash: string;
        role: UserRole;
        totp_secret: string | null;
        totp_enabled: number;
        is_active: number;
      }
    | undefined;

  if (!user || user.is_active !== 1) {
    recordLoginFailure(rateKey);
    await recordLoginAttempt({
      ipAddress: ip,
      username,
      success: false,
      userAgent: req.headers.get('user-agent') || undefined,
    });
    recordAudit({
      username,
      action: 'LOGIN',
      target: 'auth',
      status: 'failed',
      detail: 'Akun tidak ditemukan atau nonaktif',
      ip,
    });
    return NextResponse.json(
      { error: 'Username atau kata sandi salah.' },
      { status: 401 }
    );
  }

  const validPass = await verifyPassword(parsed.data.password, user.password_hash);
  if (!validPass) {
    recordLoginFailure(rateKey);
    await recordLoginAttempt({
      ipAddress: ip,
      username: user.username,
      success: false,
      userAgent: req.headers.get('user-agent') || undefined,
    });
    recordAudit({
      userId: user.id,
      username: user.username,
      action: 'LOGIN',
      target: 'auth',
      status: 'failed',
      detail: 'Kata sandi salah',
      ip,
    });
    return NextResponse.json(
      { error: 'Username atau kata sandi salah.' },
      { status: 401 }
    );
  }

  // Jika 2FA TOTP aktif, wajib verifikasi kode 6 digit
  if (user.totp_enabled === 1 && user.totp_secret) {
    if (!parsed.data.totpCode) {
      return NextResponse.json(
        { requires2fa: true, message: 'Masukkan kode 2FA dari aplikasi authenticator.' },
        { status: 200 }
      );
    }
    const validTotp = verifyTotpCode(user.totp_secret, parsed.data.totpCode);
    if (!validTotp) {
      recordLoginFailure(rateKey);
      recordAudit({
        userId: user.id,
        username: user.username,
        action: 'LOGIN_2FA',
        target: 'auth',
        status: 'failed',
        detail: 'Kode TOTP tidak cocok',
        ip,
      });
      return NextResponse.json(
        { error: 'Kode 2FA tidak valid.', requires2fa: true },
        { status: 401 }
      );
    }
  }

  clearLoginFailures(rateKey);
  await recordLoginAttempt({
    ipAddress: ip,
    username: user.username,
    success: true,
    userAgent: req.headers.get('user-agent') || undefined,
  });
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(
    user.id
  );

  const token = await signSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const isHttps =
    req.headers.get('x-forwarded-proto')?.includes('https') ||
    req.headers.get('origin')?.startsWith('https://') ||
    req.headers.get('referer')?.startsWith('https://') ||
    req.headers.get('x-forwarded-host')?.includes('.run.app') ||
    req.nextUrl.protocol === 'https:';

  recordAudit({
    userId: user.id,
    username: user.username,
    action: 'LOGIN',
    target: 'auth',
    status: 'success',
    detail: user.totp_enabled === 1 ? 'Login dengan 2FA' : 'Login standar',
    ip,
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      totp_enabled: user.totp_enabled === 1,
    },
  });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    token,
    buildSessionCookieOptions(isHttps)
  );
  return response;
}
