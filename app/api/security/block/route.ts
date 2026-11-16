import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { blockIpManually, unblockIp, isIpBlocked } from '@/lib/system/security';
import { recordAudit } from '@/lib/api-guard';
import { z } from 'zod';

const BlockSchema = z.object({
  ip: z.string().min(1),
  reason: z.string().min(1).max(255),
  permanent: z.boolean().default(false),
});

const UnblockSchema = z.object({
  ip: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const body = await req.json();
    const parsed = BlockSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'IP dan alasan wajib diisi' }, { status: 400 });
    }

    const { ip, reason, permanent } = parsed.data;

    // Validate IP format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return NextResponse.json({ error: 'Format IP tidak valid' }, { status: 400 });
    }

    const user = (req as any).user;
    blockIpManually(ip, reason, permanent, user.username);

    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'BLOCK_IP',
      target: '/api/security/block',
      status: 'success',
      detail: `Blocked IP ${ip}: ${reason}${permanent ? ' (permanen)' : ''}`,
      ip: (req as any).ip,
    });

    return NextResponse.json({ message: `IP ${ip} berhasil diblokir${permanent ? ' permanen' : ''}` });
  } catch (err) {
    console.error('Failed to block IP:', err);
    return NextResponse.json({ error: 'Gagal memblokir IP' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const body = await req.json();
    const parsed = UnblockSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'IP wajib diisi' }, { status: 400 });
    }

    const { ip } = parsed.data;

    const user = (req as any).user;
    unblockIp(ip);

    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'UNBLOCK_IP',
      target: '/api/security/block',
      status: 'success',
      detail: `Unblocked IP ${ip}`,
      ip: (req as any).ip,
    });

    return NextResponse.json({ message: `IP ${ip} berhasil dibuka blokirnya` });
  } catch (err) {
    console.error('Failed to unblock IP:', err);
    return NextResponse.json({ error: 'Gagal membuka blokir IP' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const { searchParams } = new URL(req.url);
    const ip = searchParams.get('ip');

    if (!ip) {
      return NextResponse.json({ error: 'IP wajib diisi' }, { status: 400 });
    }

    const result = isIpBlocked(ip);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to check IP block status:', err);
    return NextResponse.json({ error: 'Gagal memeriksa status IP' }, { status: 500 });
  }
}