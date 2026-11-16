import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { DOMAIN_REGEX } from '@/lib/security';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import {
  applyNginxVhost,
  issueLetsEncryptSsl,
  removeNginxVhost,
} from '@/lib/system/nginx';
import type { WebsiteRecord } from '@/types/panel';

const CreateWebsiteSchema = z.object({
  domain: z.string().trim().regex(DOMAIN_REGEX, 'Nama domain tidak valid.'),
  rootPath: z.string().trim().min(1).max(255),
  type: z.enum(['static', 'php', 'proxy']),
  proxyPass: z
    .string()
    .trim()
    .regex(/^https?:\/\/[a-zA-Z0-9.:_-]+$/)
    .optional()
    .or(z.literal('')),
  phpVersion: z
    .string()
    .trim()
    .regex(/^\d\.\d$/)
    .optional()
    .or(z.literal('')),
  forceHttps: z.boolean().optional(),
});

const SslSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email('Email tidak valid untuk Let’s Encrypt.'),
  forceHttps: z.boolean(),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  const websites = db
    .prepare('SELECT * FROM websites ORDER BY created_at DESC')
    .all() as WebsiteRecord[];

  return NextResponse.json({ websites });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = CreateWebsiteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Input website tidak valid.' },
      { status: 400 }
    );
  }

  const data = parsed.data;
  if (data.type === 'proxy' && !data.proxyPass) {
    return NextResponse.json(
      { error: 'URL tujuan Reverse Proxy wajib diisi (mis. http://127.0.0.1:4000).' },
      { status: 400 }
    );
  }

  const db = getDb();
  const exists = db
    .prepare('SELECT id FROM websites WHERE domain = ?')
    .get(data.domain.toLowerCase());
  if (exists) {
    return NextResponse.json(
      { error: 'Domain sudah terdaftar.' },
      { status: 409 }
    );
  }

  try {
    const nginxRes = await applyNginxVhost({
      domain: data.domain.toLowerCase(),
      rootPath: data.rootPath,
      type: data.type,
      proxyPass: data.proxyPass || undefined,
      phpVersion: data.phpVersion || undefined,
      forceHttps: data.forceHttps ?? false,
      sslEnabled: false,
    });

    const info = db
      .prepare(
        `INSERT INTO websites (domain, root_path, type, proxy_pass, php_version, ssl_enabled, force_https, status)
         VALUES (?, ?, ?, ?, ?, 0, ?, 'active')`
      )
      .run(
        data.domain.toLowerCase(),
        data.rootPath,
        data.type,
        data.proxyPass || null,
        data.phpVersion || null,
        data.forceHttps ? 1 : 0
      );

    recordAudit({
      userId: guard.session.userId,
      username: guard.session.username,
      action: 'WEBSITE_CREATE',
      target: data.domain.toLowerCase(),
      status: 'success',
      detail: nginxRes.message,
      ip: guard.ip,
    });

    return NextResponse.json({
      ok: true,
      id: Number(info.lastInsertRowid),
      message: nginxRes.message,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal membuat virtual host.' },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = SslSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Input SSL tidak valid.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const site = db
    .prepare('SELECT * FROM websites WHERE id = ?')
    .get(parsed.data.id) as WebsiteRecord | undefined;
  if (!site) {
    return NextResponse.json({ error: 'Website tidak ditemukan.' }, { status: 404 });
  }

  const sslRes = await issueLetsEncryptSsl(
    site.domain,
    parsed.data.email,
    parsed.data.forceHttps
  );

  if (sslRes.ok) {
    db.prepare('UPDATE websites SET ssl_enabled = 1, force_https = ? WHERE id = ?').run(
      parsed.data.forceHttps ? 1 : 0,
      site.id
    );
    await applyNginxVhost({
      domain: site.domain,
      rootPath: site.root_path,
      type: site.type,
      proxyPass: site.proxy_pass || undefined,
      phpVersion: site.php_version || undefined,
      sslEnabled: true,
      forceHttps: parsed.data.forceHttps,
    });
  }

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'WEBSITE_SSL',
    target: site.domain,
    status: sslRes.ok ? 'success' : 'failed',
    detail: sslRes.message,
    ip: guard.ip,
  });

  if (!sslRes.ok) {
    return NextResponse.json({ error: sslRes.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: sslRes.message });
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID website tidak valid.' }, { status: 400 });
  }

  const db = getDb();
  const site = db
    .prepare('SELECT * FROM websites WHERE id = ?')
    .get(id) as WebsiteRecord | undefined;
  if (!site) {
    return NextResponse.json({ error: 'Website tidak ditemukan.' }, { status: 404 });
  }

  const msg = await removeNginxVhost(site.domain);
  db.prepare('DELETE FROM websites WHERE id = ?').run(id);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'WEBSITE_DELETE',
    target: site.domain,
    status: 'success',
    detail: msg,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: msg });
}
