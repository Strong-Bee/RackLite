import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { resolveSafePath } from '@/lib/system/files';

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const targetPath = req.nextUrl.searchParams.get('path') || '';
  if (!targetPath) {
    return NextResponse.json({ error: 'Path wajib diisi.' }, { status: 400 });
  }

  try {
    const { safePath } = await resolveSafePath(targetPath, true);
    const stat = await fs.stat(safePath);
    if (stat.isDirectory()) {
      return NextResponse.json(
        { error: 'Tidak dapat mengunduh folder langsung; kompres ke ZIP terlebih dahulu.' },
        { status: 400 }
      );
    }

    const data = await fs.readFile(safePath);
    const filename = path.basename(safePath).replace(/"/g, '');
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(stat.size),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal mengunduh berkas.' },
      { status: 400 }
    );
  }
}
