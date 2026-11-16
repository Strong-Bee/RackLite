import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';
import { recordAudit, requireAuth } from '@/lib/api-guard';

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (guard.ok) {
    recordAudit({
      userId: guard.session.userId,
      username: guard.session.username,
      action: 'LOGOUT',
      target: 'auth',
      status: 'success',
      ip: guard.ip,
    });
  }

  const isHttps =
    req.headers.get('x-forwarded-proto')?.includes('https') ||
    req.headers.get('origin')?.startsWith('https://') ||
    req.headers.get('referer')?.startsWith('https://') ||
    req.headers.get('x-forwarded-host')?.includes('.run.app') ||
    req.nextUrl.protocol === 'https:';

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
    maxAge: 0,
  });
  return response;
}
