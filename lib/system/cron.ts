import { execFile } from 'node:child_process';
import { getDb } from '@/lib/db';
import { findBinary } from '@/lib/system/exec';
import { USERNAME_REGEX } from '@/lib/security';
import type { CronJobRecord } from '@/types/panel';

/**
 * Sinkronisasi jadwal cron aktif dari SQLite ke crontab user Linux terkait.
 */
export async function syncCrontabForUser(linuxUser: string): Promise<{
  ok: boolean;
  syncedToOs: boolean;
  message: string;
}> {
  if (!USERNAME_REGEX.test(linuxUser)) {
    return { ok: false, syncedToOs: false, message: 'Username Linux tidak valid.' };
  }

  const crontabBin = await findBinary('crontab');
  if (!crontabBin) {
    return {
      ok: true,
      syncedToOs: false,
      message: 'Biner crontab tidak terpasang di container ini; tugas disimpan di database panel.',
    };
  }

  const db = getDb();
  const jobs = db
    .prepare(
      'SELECT * FROM cron_jobs WHERE linux_user = ? AND enabled = 1 ORDER BY id ASC'
    )
    .all(linuxUser) as CronJobRecord[];

  const lines = [
    '# Managed by RackLite Server Panel - jangan edit bagian ini secara manual',
    ...jobs.map((j) => `${j.schedule} ${j.command}`),
    '',
  ].join('\n');

  return new Promise((resolve) => {
    const child = execFile(crontabBin, ['-u', linuxUser, '-'], (err, _stdout, stderr) => {
      if (err) {
        resolve({
          ok: true,
          syncedToOs: false,
          message: `Tersimpan di panel, namun sinkronisasi crontab OS dilewati (${stderr.trim() || err.message}).`,
        });
      } else {
        resolve({
          ok: true,
          syncedToOs: true,
          message: `Crontab untuk user "${linuxUser}" berhasil disinkronkan ke OS.`,
        });
      }
    });
    child.stdin?.write(lines);
    child.stdin?.end();
  });
}
