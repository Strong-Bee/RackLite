import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { IP_CIDR_REGEX, isValidPortSpec } from '@/lib/security';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import {
  applyUfwRule,
  deleteUfwRule,
  getOpenListeningPorts,
  getUfwStatusSummary,
} from '@/lib/system/firewall';
import type { FirewallRuleRecord } from '@/types/panel';

const FirewallRuleSchema = z.object({
  port: z.string().trim().refine(isValidPortSpec, 'Nomor port tidak valid (1-65535).'),
  protocol: z.enum(['tcp', 'udp', 'any']),
  action: z.enum(['allow', 'deny']),
  sourceIp: z
    .string()
    .trim()
    .regex(IP_CIDR_REGEX, 'Format IP/CIDR tidak valid.')
    .default('any'),
  comment: z.string().trim().max(120).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  const rules = db
    .prepare('SELECT * FROM firewall_rules ORDER BY id DESC')
    .all() as FirewallRuleRecord[];
  const [ufw, openPorts] = await Promise.all([
    getUfwStatusSummary(),
    getOpenListeningPorts(),
  ]);

  return NextResponse.json({ rules, ufw, openPorts });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = FirewallRuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Input aturan firewall tidak valid.' },
      { status: 400 }
    );
  }

  const res = await applyUfwRule(parsed.data);
  if (!res.ok) {
    return NextResponse.json({ error: res.message }, { status: 400 });
  }

  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO firewall_rules (port, protocol, action, source_ip, comment) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      parsed.data.port,
      parsed.data.protocol,
      parsed.data.action,
      parsed.data.sourceIp,
      parsed.data.comment || ''
    );

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'FIREWALL_ADD',
    target: `${parsed.data.action.toUpperCase()} ${parsed.data.port}/${parsed.data.protocol}`,
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

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID aturan tidak valid.' }, { status: 400 });
  }

  const db = getDb();
  const rule = db
    .prepare('SELECT * FROM firewall_rules WHERE id = ?')
    .get(id) as FirewallRuleRecord | undefined;
  if (!rule) {
    return NextResponse.json({ error: 'Aturan tidak ditemukan.' }, { status: 404 });
  }

  const res = await deleteUfwRule({
    port: rule.port,
    protocol: rule.protocol,
    action: rule.action,
    sourceIp: rule.source_ip,
  });
  db.prepare('DELETE FROM firewall_rules WHERE id = ?').run(id);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'FIREWALL_DELETE',
    target: `${rule.action} ${rule.port}/${rule.protocol}`,
    status: 'success',
    detail: res.message,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: res.message });
}
