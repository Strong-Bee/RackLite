import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { readLogTail, type LogSourceId } from '@/lib/system/logs';

const VALID_SOURCES = new Set<LogSourceId>([
  'panel',
  'nginx-access',
  'nginx-error',
  'syslog',
]);

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const sourceParam = (req.nextUrl.searchParams.get('source') || 'panel') as LogSourceId;
  const source: LogSourceId = VALID_SOURCES.has(sourceParam) ? sourceParam : 'panel';
  const lines = Number(req.nextUrl.searchParams.get('lines') || '150');
  const filter = req.nextUrl.searchParams.get('filter') || '';

  const data = await readLogTail({ source, lines, filter });
  return NextResponse.json(data);
}
