import fs from 'node:fs/promises';
import path from 'node:path';
import { getDataDir, getDb } from '@/lib/db';
import { runSystemCommand } from '@/lib/system/exec';
import { resolveSafePath } from '@/lib/system/files';
import { dumpDatabase } from '@/lib/system/database';
import { uploadFileToS3, type S3Config } from '@/lib/s3';
import { DB_NAME_REGEX } from '@/lib/security';

function getS3ConfigFromDb(): S3Config {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key LIKE 's3_%'")
    .all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    endpoint: map.get('s3_endpoint') || '',
    bucket: map.get('s3_bucket') || '',
    region: map.get('s3_region') || 'us-east-1',
    accessKey: map.get('s3_access_key') || '',
    secretKey: map.get('s3_secret_key') || '',
  };
}

export async function createSystemBackup(params: {
  name: string;
  backupType: 'files' | 'database' | 'full';
  target: 'local' | 's3';
  sourcePath: string;
  dbEngine?: 'mariadb' | 'postgres';
  dbName?: string;
}): Promise<{
  filePath: string;
  s3Key: string | null;
  sizeBytes: number;
  status: string;
  message: string;
}> {
  const backupsDir = path.join(getDataDir(), 'backups');
  await fs.mkdir(backupsDir, { recursive: true });

  const cleanName = params.name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'backup';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveName = `${cleanName}-${stamp}.tar.gz`;
  const archivePath = path.join(backupsDir, archiveName);

  if (params.backupType === 'database') {
    if (!params.dbName || !DB_NAME_REGEX.test(params.dbName)) {
      throw new Error('Nama database tidak valid untuk backup.');
    }
    const dumpRes = await dumpDatabase(params.dbEngine || 'mariadb', params.dbName);
    if (!dumpRes.ok || !dumpRes.filePath) {
      throw new Error(dumpRes.message);
    }
    const tarRes = await runSystemCommand('tar', [
      '-czf',
      archivePath,
      '-C',
      path.dirname(dumpRes.filePath),
      path.basename(dumpRes.filePath),
    ]);
    await fs.unlink(dumpRes.filePath).catch(() => {});
    if (!tarRes.ok) {
      throw new Error(`Gagal mengarsipkan dump database: ${tarRes.stderr}`);
    }
  } else {
    const { safePath } = await resolveSafePath(params.sourcePath, true);
    const tarRes = await runSystemCommand('tar', [
      '-czf',
      archivePath,
      '-C',
      path.dirname(safePath),
      path.basename(safePath),
    ]);
    if (!tarRes.ok) {
      throw new Error(`Gagal membuat arsip tar.gz: ${tarRes.stderr}`);
    }
  }

  const stat = await fs.stat(archivePath);
  let s3Key: string | null = null;
  let status = 'completed';
  let message = `Backup lokal berhasil dibuat (${archiveName}).`;

  if (params.target === 's3') {
    s3Key = `racklite-backups/${archiveName}`;
    const s3Cfg = getS3ConfigFromDb();
    const s3Res = await uploadFileToS3(s3Cfg, archivePath, s3Key);
    if (!s3Res.ok) {
      status = 'partial_local_only';
      message = `Backup lokal dibuat, namun upload S3 gagal: ${s3Res.error}`;
    } else {
      message = `Backup berhasil dibuat dan diunggah ke S3 (${s3Key}).`;
    }
  }

  return {
    filePath: archivePath,
    s3Key,
    sizeBytes: stat.size,
    status,
    message,
  };
}

export async function restoreBackupArchive(
  archivePath: string,
  destinationDir: string
): Promise<{ ok: boolean; message: string }> {
  const backupsDir = path.resolve(path.join(getDataDir(), 'backups'));
  const resolvedArchive = path.resolve(archivePath);
  if (!resolvedArchive.startsWith(backupsDir + path.sep)) {
    return { ok: false, message: 'Path arsip backup tidak sah.' };
  }

  const { safePath: safeDest } = await resolveSafePath(destinationDir, true);
  const res = await runSystemCommand('tar', ['-xzf', resolvedArchive, '-C', safeDest]);
  if (!res.ok) {
    return { ok: false, message: `Restore gagal: ${res.stderr}` };
  }
  return {
    ok: true,
    message: `Backup berhasil di-restore ke ${safeDest}.`,
  };
}
