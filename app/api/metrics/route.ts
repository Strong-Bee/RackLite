import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { collectSystemMetrics } from '@/lib/system/metrics';

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const metrics = await collectSystemMetrics();
  return NextResponse.json(metrics);
}
