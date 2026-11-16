import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import {
  generateTotpQrDataUrl,
  generateTotpSetup,
  verifyTotpCode,
} from '@/lib/auth';
import { recordAudit, requireAuth } from '@/lib/api-guard';

const TotpActionSchema = z.object({
  action: z.enum(['enable', 'disable']),
  secret: z.string().optional(),
  code: z.string().min(6).max(8),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const setup = generateTotpSetup(guard.session.username);
  const qrDataUrl = await generateTotpQrDataUrl(setup.uri);
  return NextResponse.json({
    secret: setup.secret,
    uri: setup.uri,
    qrDataUrl,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const parsed = TotpActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Input verifikasi 2FA tidak valid.' },
      { status: 400 }
    );
  }

  const db = getDb();
  if (parsed.data.action === 'enable') {
    if (!parsed.data.secret) {
      return NextResponse.json(
        { error: 'Secret TOTP diperlukan.' },
        { status: 400 }
      );
    }
    if (!verifyTotpCode(parsed.data.secret, parsed.data.code)) {
      return NextResponse.json(
        { error: 'Kode TOTP tidak cocok. Periksa jam server & aplikasi Anda.' },
        { status: 400 }
      );
    }
    db.prepare(
      'UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?'
    ).run(parsed.data.secret, guard.session.userId);

    recordAudit({
      userId: guard.session.userId,
      username: guard.session.username,
      action: 'ENABLE_2FA',
      target: guard.session.username,
      status: 'success',
      ip: guard.ip,
    });
    return NextResponse.json({ ok: true, message: '2FA TOTP berhasil diaktifkan.' });
  }

  // Disable 2FA
  const user = db
    .prepare('SELECT totp_secret FROM users WHERE id = ?')
    .get(guard.session.userId) as { totp_secret: string | null } | undefined;

  if (!user?.totp_secret || !verifyTotpCode(user.totp_secret, parsed.data.code)) {
    return NextResponse.json(
      { error: 'Kode TOTP salah untuk menonaktifkan 2FA.' },
      { status: 400 }
    );
  }

  db.prepare(
    'UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?'
  ).run(guard.session.userId);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'DISABLE_2FA',
    target: guard.session.username,
    status: 'success',
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: '2FA TOTP dinonaktifkan.' });
}
