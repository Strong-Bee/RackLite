import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { USERNAME_REGEX } from '@/lib/security';
import { validateCronExpression } from '@/lib/cron-utils';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import { syncCrontabForUser } from '@/lib/system/cron';
import type { CronJobRecord } from '@/types/panel';

const CronSchema = z.object({
  id: z.number().int().positive().optional(),
  linuxUser: z.string().trim().regex(USERNAME_REGEX, 'Username Linux tidak valid.'),
  schedule: z.string().trim().min(5).max(64),
  command: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((v) => !v.includes('\n') && !v.includes('\r'), {
      message: 'Perintah cron tidak boleh mengandung newline.',
    }),
  description: z.string().trim().max(200).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  const jobs = db
    .prepare('SELECT * FROM cron_jobs ORDER BY id DESC')
    .all() as CronJobRecord[];

  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = CronSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Input cron job tidak valid.' },
      { status: 400 }
    );
  }

  const cronCheck = validateCronExpression(parsed.data.schedule);
  if (!cronCheck.valid) {
    return NextResponse.json({ error: cronCheck.reason }, { status: 400 });
  }

  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO cron_jobs (linux_user, schedule, command, description, enabled) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      parsed.data.linuxUser,
      parsed.data.schedule,
      parsed.data.command,
      parsed.data.description || '',
      parsed.data.enabled === false ? 0 : 1
    );

  const syncRes = await syncCrontabForUser(parsed.data.linuxUser);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'CRON_CREATE',
    target: `${parsed.data.linuxUser}: ${parsed.data.schedule}`,
    status: 'success',
    detail: syncRes.message,
    ip: guard.ip,
  });

  return NextResponse.json({
    ok: true,
    id: Number(info.lastInsertRowid),
    message: syncRes.message,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = CronSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json(
      { error: parsed.error?.issues[0]?.message || 'ID dan data cron wajib diisi.' },
      { status: 400 }
    );
  }

  const cronCheck = validateCronExpression(parsed.data.schedule);
  if (!cronCheck.valid) {
    return NextResponse.json({ error: cronCheck.reason }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    'UPDATE cron_jobs SET linux_user = ?, schedule = ?, command = ?, description = ?, enabled = ? WHERE id = ?'
  ).run(
    parsed.data.linuxUser,
    parsed.data.schedule,
    parsed.data.command,
    parsed.data.description || '',
    parsed.data.enabled === false ? 0 : 1,
    parsed.data.id
  );

  const syncRes = await syncCrontabForUser(parsed.data.linuxUser);
  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'CRON_UPDATE',
    target: `cron#${parsed.data.id}`,
    status: 'success',
    detail: syncRes.message,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: syncRes.message });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID cron tidak valid.' }, { status: 400 });
  }

  const db = getDb();
  const job = db
    .prepare('SELECT * FROM cron_jobs WHERE id = ?')
    .get(id) as CronJobRecord | undefined;
  if (!job) {
    return NextResponse.json({ error: 'Cron job tidak ditemukan.' }, { status: 404 });
  }

  db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id);
  const syncRes = await syncCrontabForUser(job.linux_user);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'CRON_DELETE',
    target: `cron#${id}`,
    status: 'success',
    detail: syncRes.message,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: syncRes.message });
}
