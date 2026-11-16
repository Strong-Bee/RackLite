import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { USERNAME_REGEX } from '@/lib/security';
import { recordAudit, requireAuth } from '@/lib/api-guard';

const CreateUserSchema = z.object({
  username: z.string().trim().regex(USERNAME_REGEX, 'Format username tidak valid.'),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'user']),
});

const PatchUserSchema = z.object({
  id: z.number().int().positive(),
  role: z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, username, role, totp_enabled, is_active, created_at, last_login_at FROM users ORDER BY id ASC'
    )
    .all() as Array<{
    id: number;
    username: string;
    role: string;
    totp_enabled: number;
    is_active: number;
    created_at: string;
    last_login_at: string | null;
  }>;

  return NextResponse.json({
    users: rows.map((u) => ({
      ...u,
      totp_enabled: u.totp_enabled === 1,
      is_active: u.is_active === 1,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = CreateUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Data pengguna tidak valid.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const username = parsed.data.username.toLowerCase();
  const exists = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(username);
  if (exists) {
    return NextResponse.json(
      { error: 'Username sudah terdaftar.' },
      { status: 409 }
    );
  }

  const hash = await hashPassword(parsed.data.password);
  const info = db
    .prepare(
      'INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, ?, 1)'
    )
    .run(username, hash, parsed.data.role);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'USER_CREATE',
    target: username,
    status: 'success',
    detail: `Role: ${parsed.data.role}`,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid) });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = PatchUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid.' }, { status: 400 });
  }

  if (parsed.data.id === guard.session.userId && parsed.data.isActive === false) {
    return NextResponse.json(
      { error: 'Tidak dapat menonaktifkan akun sendiri.' },
      { status: 400 }
    );
  }

  const db = getDb();
  if (parsed.data.role !== undefined) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(
      parsed.data.role,
      parsed.data.id
    );
  }
  if (parsed.data.isActive !== undefined) {
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(
      parsed.data.isActive ? 1 : 0,
      parsed.data.id
    );
  }

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'USER_UPDATE',
    target: `user#${parsed.data.id}`,
    status: 'success',
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const idParam = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(idParam) || idParam <= 0) {
    return NextResponse.json({ error: 'ID user tidak valid.' }, { status: 400 });
  }
  if (idParam === guard.session.userId) {
    return NextResponse.json(
      { error: 'Tidak dapat menghapus akun sendiri.' },
      { status: 400 }
    );
  }

  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(idParam);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'USER_DELETE',
    target: `user#${idParam}`,
    status: 'success',
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true });
}
