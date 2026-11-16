import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  const user = db
    .prepare(
      'SELECT id, username, role, totp_enabled, is_active, created_at, last_login_at FROM users WHERE id = ?'
    )
    .get(guard.session.userId) as
    | {
        id: number;
        username: string;
        role: string;
        totp_enabled: number;
        is_active: number;
        created_at: string;
        last_login_at: string | null;
      }
    | undefined;

  if (!user) {
    return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
  }

  const settingsRows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('theme', 'language', 'panel_domain')")
    .all() as Array<{ key: string; value: string }>;
  const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  return NextResponse.json({
    user: {
      ...user,
      totp_enabled: user.totp_enabled === 1,
      is_active: user.is_active === 1,
    },
    preferences: {
      theme: settingsMap.theme || 'dark',
      language: settingsMap.language || 'id',
      panelDomain: settingsMap.panel_domain || 'localhost',
    },
  });
}
