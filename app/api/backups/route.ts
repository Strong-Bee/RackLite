import fs from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { validateCronExpression } from '@/lib/cron-utils';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import { createSystemBackup, restoreBackupArchive } from '@/lib/system/backup';
import type { BackupRecord } from '@/types/panel';

const CreateBackupSchema = z.object({
  name: z.string().trim().min(1).max(64),
  backupType: z.enum(['files', 'database', 'full']),
  target: z.enum(['local', 's3']),
  sourcePath: z.string().trim().min(1).max(300),
  dbEngine: z.enum(['mariadb', 'postgres']).optional(),
  dbName: z.string().trim().optional(),
  scheduleCron: z.string().trim().optional(),
});

const RestoreSchema = z.object({
  id: z.number().int().positive(),
  destinationDir: z.string().trim().min(1).max(300),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  const backups = db
    .prepare('SELECT * FROM backups ORDER BY id DESC')
    .all() as BackupRecord[];

  return NextResponse.json({ backups });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = CreateBackupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Input backup tidak valid.' },
      { status: 400 }
    );
  }

  if (parsed.data.scheduleCron) {
    const cronCheck = validateCronExpression(parsed.data.scheduleCron);
    if (!cronCheck.valid) {
      return NextResponse.json({ error: cronCheck.reason }, { status: 400 });
    }
  }

  try {
    const result = await createSystemBackup(parsed.data);
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO backups (name, backup_type, target, source_path, file_path, s3_key, size_bytes, schedule_cron, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        parsed.data.name,
        parsed.data.backupType,
        parsed.data.target,
        parsed.data.sourcePath,
        result.filePath,
        result.s3Key,
        result.sizeBytes,
        parsed.data.scheduleCron || null,
        result.status
      );

    recordAudit({
      userId: guard.session.userId,
      username: guard.session.username,
      action: 'BACKUP_CREATE',
      target: parsed.data.name,
      status: 'success',
      detail: result.message,
      ip: guard.ip,
    });

    return NextResponse.json({
      ok: true,
      id: Number(info.lastInsertRowid),
      message: result.message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal membuat backup.' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = RestoreSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input restore tidak valid.' }, { status: 400 });
  }

  const db = getDb();
  const backup = db
    .prepare('SELECT * FROM backups WHERE id = ?')
    .get(parsed.data.id) as BackupRecord | undefined;
  if (!backup) {
    return NextResponse.json({ error: 'Backup tidak ditemukan.' }, { status: 404 });
  }

  const res = await restoreBackupArchive(backup.file_path, parsed.data.destinationDir);
  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'BACKUP_RESTORE',
    target: backup.name,
    status: res.ok ? 'success' : 'failed',
    detail: res.message,
    ip: guard.ip,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: res.message });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID backup tidak valid.' }, { status: 400 });
  }

  const db = getDb();
  const backup = db
    .prepare('SELECT * FROM backups WHERE id = ?')
    .get(id) as BackupRecord | undefined;
  if (!backup) {
    return NextResponse.json({ error: 'Backup tidak ditemukan.' }, { status: 404 });
  }

  await fs.unlink(backup.file_path).catch(() => {});
  db.prepare('DELETE FROM backups WHERE id = ?').run(id);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'BACKUP_DELETE',
    target: backup.name,
    status: 'success',
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true });
}
