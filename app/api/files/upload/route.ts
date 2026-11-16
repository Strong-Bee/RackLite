import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import { resolveSafePath } from '@/lib/system/files';

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  try {
    const formData = await req.formData();
    const dir = String(formData.get('dir') || '');
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Berkas unggahan tidak ditemukan.' }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Ukuran berkas maksimal 50 MB.' }, { status: 400 });
    }

    const safeFileName = path.basename(file.name);
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
      return NextResponse.json({ error: 'Nama berkas tidak valid.' }, { status: 400 });
    }

    const { safePath: safeDir } = await resolveSafePath(dir, true);
    const dest = path.join(safeDir, safeFileName);
    const { safePath: finalDest } = await resolveSafePath(dest, false);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(finalDest, buffer);

    recordAudit({
      userId: guard.session.userId,
      username: guard.session.username,
      action: 'FILE_UPLOAD',
      target: finalDest,
      status: 'success',
      detail: `${file.size} bytes`,
      ip: guard.ip,
    });

    return NextResponse.json({ ok: true, path: finalDest, size: file.size });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal mengunggah berkas.' },
      { status: 400 }
    );
  }
}
