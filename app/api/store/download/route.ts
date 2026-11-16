import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';
import { recordAudit } from '@/lib/api-guard';
import { runSystemCommand } from '@/lib/system/exec';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export async function POST(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const body = await req.json() as { slug: string; version?: string };
    const { slug, version } = body;

    if (!slug) {
      return NextResponse.json({ error: 'Slug aplikasi diperlukan' }, { status: 400 });
    }

    const db = getDb();
    const app = db.prepare('SELECT * FROM store_applications WHERE slug = ?').get(slug) as
      | {
          id: number;
          slug: string;
          name: string;
          installation_config: string | null;
        }
      | undefined;

    if (!app) {
      return NextResponse.json({ error: 'Aplikasi tidak ditemukan' }, { status: 404 });
    }

    const installConfig = app.installation_config ? JSON.parse(app.installation_config) : {};
    const downloadUrl = installConfig.download_url || installConfig.image;

    if (!downloadUrl) {
      return NextResponse.json({ error: 'Tidak ada URL download untuk aplikasi ini' }, { status: 400 });
    }

    const taskId = crypto.randomUUID();
    const downloadDir = path.resolve(process.env.PANEL_DATA_DIR || './data', 'downloads');
    await fs.mkdir(downloadDir, { recursive: true });

    const fileName = path.basename(downloadUrl.split('?')[0]);
    const filePath = path.join(downloadDir, fileName);

    db.prepare(`
      INSERT INTO installation_tasks (id, application_id, action, status, progress, logs, started_at)
      VALUES (?, ?, 'install', 'running', 0, '', datetime('now'))
    `).run(taskId, app.id);

    const downloadPromise = runDownload(taskId, downloadUrl, filePath, installConfig);
    downloadPromise.catch(err => {
      console.error('Download failed:', err);
      db.prepare(`
        UPDATE installation_tasks SET status = 'failed', error_message = ?, progress = 0, completed_at = datetime('now')
        WHERE id = ?
      `).run(err.message, taskId);
    });

    return NextResponse.json({
      message: 'Download dimulai',
      taskId,
      filePath
    });
  } catch (err) {
    console.error('Download failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memulai download' }, { status: 500 });
  }
}

async function runDownload(taskId: string, url: string, filePath: string, installConfig: any) {
  const db = getDb();

  try {
    await updateTaskProgress(taskId, 10, `Memulai download dari ${url}...`);

    const result = await runSystemCommand('curl', ['-L', '-o', filePath, '--progress-bar', url]);

    if (!result.ok) {
      throw new Error(`Download gagal: ${result.stderr}`);
    }

    await updateTaskProgress(taskId, 50, 'Download selesai, memverifikasi file...');

    const stats = await fs.stat(filePath);
    if (stats.size === 0) {
      throw new Error('File download kosong');
    }

    await updateTaskProgress(taskId, 100, `Download selesai (${formatBytes(stats.size)})`, 'completed');

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await updateTaskProgress(taskId, 0, `Gagal: ${errorMsg}`, 'failed', errorMsg);
    throw err;
  }
}

async function updateTaskProgress(taskId: string, progress: number, log: string, status?: string, errorMessage?: string) {
  const db = getDb();
  const current = db.prepare('SELECT logs FROM installation_tasks WHERE id = ?').get(taskId) as { logs: string } | undefined;
  const newLogs = (current?.logs || '') + '\n' + log;

  if (status) {
    db.prepare(`
      UPDATE installation_tasks
      SET progress = ?, logs = ?, status = ?, error_message = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(progress, newLogs, status, errorMessage || null, taskId);
  } else {
    db.prepare(`
      UPDATE installation_tasks
      SET progress = ?, logs = ?
      WHERE id = ?
    `).run(progress, newLogs, taskId);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}