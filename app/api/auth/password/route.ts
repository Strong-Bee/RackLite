import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { recordAudit, requireAuth } from '@/lib/api-guard';

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const parsed = ChangePasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Kata sandi baru minimal 8 karakter.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(guard.session.userId) as { password_hash: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Pengguna tidak ditemukan.' }, { status: 404 });
  }

  const ok = await verifyPassword(parsed.data.currentPassword, row.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: 'Kata sandi saat ini salah.' },
      { status: 400 }
    );
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    newHash,
    guard.session.userId
  );

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'CHANGE_PASSWORD',
    target: guard.session.username,
    status: 'success',
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: 'Kata sandi berhasil diperbarui.' });
}
