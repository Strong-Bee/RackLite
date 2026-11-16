import { NextRequest, NextResponse } from 'next/server';
import { getDb, writePanelLog } from '@/lib/db';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { getClientIp, isIpAllowed, verifyCsrfOrigin } from '@/lib/security';
import type { SessionPayload, UserRole } from '@/types/panel';

export interface GuardResult {
  ok: true;
  session: SessionPayload;
  ip: string;
}

export interface GuardFailure {
  ok: false;
  response: NextResponse;
}

export type AuthenticatedRequest = NextRequest & {
  user?: SessionPayload & { role: UserRole };
};

/**
 * Mencatat setiap aksi penting ke tabel audit_logs dan berkas panel.log.
 */
export function recordAudit(params: {
  userId?: number | null;
  username: string;
  action: string;
  target: string;
  status: 'success' | 'failed' | 'denied';
  detail?: string;
  ip?: string;
}) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (user_id, username, action, target, status, detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId ?? null,
      params.username,
      params.action,
      params.target,
      params.status,
      params.detail ?? '',
      params.ip ?? '127.0.0.1'
    );
    writePanelLog(
      params.status === 'success' ? 'INFO' : 'WARN',
      `[AUDIT] user=${params.username} action=${params.action} target=${params.target} status=${params.status} ip=${params.ip ?? '127.0.0.1'}`
    );
  } catch {
    // Jangan ganggu respons utama jika penulisan audit log gagal
  }
}

/**
 * Penjaga keamanan wajib untuk seluruh route handler /api/*.
 * Memeriksa IP whitelist, CSRF Origin, JWT session, status aktif user di SQLite, dan role.
 */
export async function requireAuth(
  req: NextRequest,
  options?: { requiredRole?: UserRole }
): Promise<GuardResult | GuardFailure> {
  const ip = getClientIp(req);
  const db = getDb();

  // 1. Cek IP Whitelist dari pengaturan
  const whitelistRow = db
    .prepare("SELECT value FROM settings WHERE key = 'ip_whitelist'")
    .get() as { value: string } | undefined;
  if (whitelistRow && !isIpAllowed(ip, whitelistRow.value)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Akses ditolak: IP Anda tidak ada di whitelist.' },
        { status: 403 }
      ),
    };
  }

  // 2. Cek proteksi CSRF untuk metode mutasi
  if (!verifyCsrfOrigin(req)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Validasi CSRF gagal (Origin tidak cocok).' },
        { status: 403 }
      ),
    };
  }

  // 3. Verifikasi JWT dari httpOnly cookie
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Sesi tidak ditemukan. Silakan login kembali.' },
        { status: 401 }
      ),
    };
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Sesi tidak valid atau sudah kedaluwarsa.' },
        { status: 401 }
      ),
    };
  }

  // 4. Pastikan user masih aktif dan ambil role terbaru dari DB
  const userRow = db
    .prepare('SELECT id, username, role, is_active FROM users WHERE id = ?')
    .get(session.userId) as
    | { id: number; username: string; role: UserRole; is_active: number }
    | undefined;

  if (!userRow || userRow.is_active !== 1) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Akun dinonaktifkan atau tidak ditemukan.' },
        { status: 401 }
      ),
    };
  }

  const verifiedSession: SessionPayload = {
    ...session,
    username: userRow.username,
    role: userRow.role,
  };

  // 5. Cek otorisasi role
  if (
    options?.requiredRole === 'admin' &&
    verifiedSession.role !== 'admin'
  ) {
    recordAudit({
      userId: verifiedSession.userId,
      username: verifiedSession.username,
      action: 'ACCESS_DENIED',
      target: req.nextUrl.pathname,
      status: 'denied',
      detail: 'Membutuhkan hak akses admin',
      ip,
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Akses ditolak: fitur ini khusus administrator.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: verifiedSession, ip };
}

/**
 * Helper untuk route handler yang memerlukan autentikasi.
 * Mengembalikan NextResponse jika gagal, atau undefined jika berhasil.
 */
export async function withAuth(
  req: NextRequest,
  options?: { requiredRole?: UserRole }
): Promise<NextResponse | undefined> {
  const result = await requireAuth(req, options);
  if (!result.ok) {
    return result.response;
  }
  // Attach user to request for convenience
  (req as AuthenticatedRequest).user = result.session;
  return undefined;
}
