import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { DOMAIN_REGEX } from '@/lib/security';
import { recordAudit, requireAuth } from '@/lib/api-guard';

const SettingsSchema = z.object({
  panel_port: z
    .string()
    .trim()
    .regex(/^\d{2,5}$/, 'Port panel harus berupa angka 80-65535.')
    .refine((v) => Number(v) >= 80 && Number(v) <= 65535, 'Port harus antara 80 dan 65535.'),
  panel_domain: z
    .string()
    .trim()
    .refine(
      (v) => v === 'localhost' || DOMAIN_REGEX.test(v),
      'Domain panel tidak valid.'
    ),
  ip_whitelist: z.string().trim().max(500),
  theme: z.enum(['dark', 'light']),
  language: z.enum(['id', 'en']),
  s3_endpoint: z.string().trim().max(255).optional().default(''),
  s3_bucket: z.string().trim().max(128).optional().default(''),
  s3_region: z.string().trim().max(64).optional().default('us-east-1'),
  s3_access_key: z.string().trim().max(128).optional().default(''),
  s3_secret_key: z.string().trim().max(256).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  // Jangan kirim secret key S3 mentah ke browser jika bukan admin
  if (guard.session.role !== 'admin') {
    delete map.s3_access_key;
    delete map.s3_secret_key;
    delete map.ip_whitelist;
  } else if (map.s3_secret_key) {
    map.s3_secret_key = '••••••••';
  }

  return NextResponse.json({ settings: map });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Pengaturan tidak valid.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );

  const data = parsed.data;
  const tx = db.transaction(() => {
    upsert.run('panel_port', data.panel_port);
    upsert.run('panel_domain', data.panel_domain);
    upsert.run('ip_whitelist', data.ip_whitelist);
    upsert.run('theme', data.theme);
    upsert.run('language', data.language);
    upsert.run('s3_endpoint', data.s3_endpoint);
    upsert.run('s3_bucket', data.s3_bucket);
    upsert.run('s3_region', data.s3_region || 'us-east-1');
    upsert.run('s3_access_key', data.s3_access_key);
    if (data.s3_secret_key && data.s3_secret_key !== '••••••••') {
      upsert.run('s3_secret_key', data.s3_secret_key);
    }
  });
  tx();

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'SETTINGS_UPDATE',
    target: 'panel_settings',
    status: 'success',
    detail: `theme=${data.theme}, lang=${data.language}, domain=${data.panel_domain}`,
    ip: guard.ip,
  });

  return NextResponse.json({
    ok: true,
    message: 'Pengaturan panel berhasil disimpan.',
  });
}
