import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAudit, requireAuth } from '@/lib/api-guard';
import {
  chmodEntry,
  chownEntry,
  createFileOrDir,
  deleteEntry,
  listDirectory,
  readTextFile,
  renameEntry,
  unzipArchive,
  writeTextFile,
  zipPath,
} from '@/lib/system/files';

const FileActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    parentPath: z.string().min(1),
    name: z.string().min(1).max(200),
    kind: z.enum(['file', 'directory']),
  }),
  z.object({
    action: z.literal('write'),
    path: z.string().min(1),
    content: z.string().max(2 * 1024 * 1024),
  }),
  z.object({
    action: z.literal('rename'),
    path: z.string().min(1),
    newName: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal('chmod'),
    path: z.string().min(1),
    mode: z.string().regex(/^[0-7]{3,4}$/),
  }),
  z.object({
    action: z.literal('chown'),
    path: z.string().min(1),
    owner: z.string().min(1).max(64),
    group: z.string().max(64).optional(),
  }),
  z.object({
    action: z.literal('zip'),
    path: z.string().min(1),
    archiveName: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('unzip'),
    path: z.string().min(1),
  }),
]);

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const mode = req.nextUrl.searchParams.get('mode') || 'list';
  const targetPath = req.nextUrl.searchParams.get('path') || '';

  try {
    if (mode === 'read') {
      const file = await readTextFile(targetPath);
      return NextResponse.json(file);
    }
    const listing = await listDirectory(targetPath);
    return NextResponse.json(listing);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal mengakses path.' },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const parsed = FileActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Input operasi berkas tidak valid.' },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;
    switch (data.action) {
      case 'create': {
        const created = await createFileOrDir(data.parentPath, data.name, data.kind);
        recordAudit({
          userId: guard.session.userId,
          username: guard.session.username,
          action: 'FILE_CREATE',
          target: created,
          status: 'success',
          ip: guard.ip,
        });
        return NextResponse.json({ ok: true, path: created });
      }
      case 'write': {
        await writeTextFile(data.path, data.content);
        recordAudit({
          userId: guard.session.userId,
          username: guard.session.username,
          action: 'FILE_EDIT',
          target: data.path,
          status: 'success',
          ip: guard.ip,
        });
        return NextResponse.json({ ok: true });
      }
      case 'rename': {
        const dest = await renameEntry(data.path, data.newName);
        recordAudit({
          userId: guard.session.userId,
          username: guard.session.username,
          action: 'FILE_RENAME',
          target: `${data.path} -> ${dest}`,
          status: 'success',
          ip: guard.ip,
        });
        return NextResponse.json({ ok: true, path: dest });
      }
      case 'chmod': {
        await chmodEntry(data.path, data.mode);
        recordAudit({
          userId: guard.session.userId,
          username: guard.session.username,
          action: 'FILE_CHMOD',
          target: data.path,
          status: 'success',
          detail: `mode=${data.mode}`,
          ip: guard.ip,
        });
        return NextResponse.json({ ok: true });
      }
      case 'chown': {
        if (guard.session.role !== 'admin') {
          return NextResponse.json(
            { error: 'Mengubah kepemilikan berkas memerlukan hak admin.' },
            { status: 403 }
          );
        }
        const res = await chownEntry(data.path, data.owner, data.group);
        if (!res.ok) {
          return NextResponse.json({ error: res.message }, { status: 400 });
        }
        recordAudit({
          userId: guard.session.userId,
          username: guard.session.username,
          action: 'FILE_CHOWN',
          target: data.path,
          status: 'success',
          detail: res.message,
          ip: guard.ip,
        });
        return NextResponse.json({ ok: true, message: res.message });
      }
      case 'zip': {
        const zipFile = await zipPath(data.path, data.archiveName);
        recordAudit({
          userId: guard.session.userId,
          username: guard.session.username,
          action: 'FILE_ZIP',
          target: zipFile,
          status: 'success',
          ip: guard.ip,
        });
        return NextResponse.json({ ok: true, path: zipFile });
      }
      case 'unzip': {
        const extractDir = await unzipArchive(data.path);
        recordAudit({
          userId: guard.session.userId,
          username: guard.session.username,
          action: 'FILE_UNZIP',
          target: data.path,
          status: 'success',
          ip: guard.ip,
        });
        return NextResponse.json({ ok: true, path: extractDir });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Operasi berkas gagal.' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const targetPath = req.nextUrl.searchParams.get('path') || '';
  if (!targetPath) {
    return NextResponse.json({ error: 'Path wajib diisi.' }, { status: 400 });
  }

  try {
    await deleteEntry(targetPath);
    recordAudit({
      userId: guard.session.userId,
      username: guard.session.username,
      action: 'FILE_DELETE',
      target: targetPath,
      status: 'success',
      ip: guard.ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal menghapus berkas.' },
      { status: 400 }
    );
  }
}
