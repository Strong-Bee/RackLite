import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getSecurityStats, getSecurityEvents, getBlockedIps } from '@/lib/system/security';

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const stats = getSecurityStats();
    const events = getSecurityEvents(limit);
    const blockedIps = getBlockedIps();

    return NextResponse.json({
      stats,
      events,
      blockedIps,
    });
  } catch (err) {
    console.error('Failed to load security stats:', err);
    return NextResponse.json({ error: 'Gagal memuat statistik keamanan' }, { status: 500 });
  }
}