import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { DB_NAME_REGEX } from '@/lib/security';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import {
  createDatabaseAndUser,
  dropDatabaseAndUser,
  dumpDatabase,
} from '@/lib/system/database';
import type { DatabaseRecord } from '@/types/panel';

const CreateDbSchema = z.object({
  engine: z.enum(['mariadb', 'postgres']),
  dbName: z.string().trim().regex(DB_NAME_REGEX, 'Nama database tidak valid.'),
  dbUser: z.string().trim().regex(DB_NAME_REGEX, 'Nama user DB tidak valid.'),
  password: z.string().min(8).max(128),
  privilege: z.enum(['ALL PRIVILEGES', 'SELECT, INSERT, UPDATE, DELETE', 'SELECT']),
});

const DumpDbSchema = z.object({
  id: z.number().int().positive(),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  const databases = db
    .prepare('SELECT * FROM databases ORDER BY created_at DESC')
    .all() as DatabaseRecord[];

  return NextResponse.json({ databases });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = CreateDbSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Input database tidak valid.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const exists = db
    .prepare('SELECT id FROM databases WHERE engine = ? AND db_name = ?')
    .get(parsed.data.engine, parsed.data.dbName);
  if (exists) {
    return NextResponse.json(
      { error: 'Database sudah ada untuk engine tersebut.' },
      { status: 409 }
    );
  }

  const res = await createDatabaseAndUser(parsed.data);
  if (!res.ok) {
    return NextResponse.json({ error: res.message }, { status: 400 });
  }

  const info = db
    .prepare(
      'INSERT INTO databases (engine, db_name, db_user, privilege) VALUES (?, ?, ?, ?)'
    )
    .run(
      parsed.data.engine,
      parsed.data.dbName,
      parsed.data.dbUser,
      parsed.data.privilege
    );

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'DB_CREATE',
    target: `${parsed.data.engine}:${parsed.data.dbName}`,
    status: 'success',
    detail: res.message,
    ip: guard.ip,
  });

  return NextResponse.json({
    ok: true,
    id: Number(info.lastInsertRowid),
    message: res.message,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = DumpDbSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'ID database tidak valid.' }, { status: 400 });
  }

  const db = getDb();
  const rec = db
    .prepare('SELECT * FROM databases WHERE id = ?')
    .get(parsed.data.id) as DatabaseRecord | undefined;
  if (!rec) {
    return NextResponse.json({ error: 'Database tidak ditemukan.' }, { status: 404 });
  }

  const dumpRes = await dumpDatabase(rec.engine, rec.db_name);
  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'DB_DUMP',
    target: `${rec.engine}:${rec.db_name}`,
    status: dumpRes.ok ? 'success' : 'failed',
    detail: dumpRes.message,
    ip: guard.ip,
  });

  if (!dumpRes.ok) {
    return NextResponse.json({ error: dumpRes.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: dumpRes.message });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID tidak valid.' }, { status: 400 });
  }

  const db = getDb();
  const rec = db
    .prepare('SELECT * FROM databases WHERE id = ?')
    .get(id) as DatabaseRecord | undefined;
  if (!rec) {
    return NextResponse.json({ error: 'Database tidak ditemukan.' }, { status: 404 });
  }

  const res = await dropDatabaseAndUser(rec.engine, rec.db_name, rec.db_user);
  if (!res.ok) {
    return NextResponse.json({ error: res.message }, { status: 400 });
  }
  db.prepare('DELETE FROM databases WHERE id = ?').run(id);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'DB_DELETE',
    target: `${rec.engine}:${rec.db_name}`,
    status: 'success',
    detail: res.message,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: res.message });
}
