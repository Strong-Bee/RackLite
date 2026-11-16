import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import {
  controlService,
  listServicesStatus,
  readServiceLogs,
} from '@/lib/system/services';

const ServiceActionSchema = z.object({
  name: z.string().min(1).max(64),
  action: z.enum(['start', 'stop', 'restart', 'reload', 'enable', 'disable']),
});

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const logsFor = req.nextUrl.searchParams.get('logs');
  if (logsFor) {
    const res = await readServiceLogs(logsFor, 100);
    return NextResponse.json(res);
  }

  const status = await listServicesStatus();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = ServiceActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input aksi service tidak valid.' }, { status: 400 });
  }

  const res = await controlService(parsed.data.name, parsed.data.action);
  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: `SERVICE_${parsed.data.action.toUpperCase()}`,
    target: parsed.data.name,
    status: res.ok ? 'success' : 'failed',
    detail: res.message,
    ip: guard.ip,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: res.message });
}
