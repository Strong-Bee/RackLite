import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/api-guard';
import type { AuditLogRecord } from '@/types/panel';

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const limit = Math.min(
    Math.max(10, Number(req.nextUrl.searchParams.get('limit') || '100')),
    500
  );
  const query = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();

  const db = getDb();
  let logs: AuditLogRecord[];

  if (guard.session.role === 'admin') {
    logs = db
      .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
      .all(limit) as AuditLogRecord[];
  } else {
    logs = db
      .prepare(
        'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?'
      )
      .all(guard.session.userId, limit) as AuditLogRecord[];
  }

  if (query) {
    logs = logs.filter(
      (l) =>
        l.username.toLowerCase().includes(query) ||
        l.action.toLowerCase().includes(query) ||
        l.target.toLowerCase().includes(query) ||
        l.ip_address.toLowerCase().includes(query)
    );
  }

  return NextResponse.json({ logs });
}
