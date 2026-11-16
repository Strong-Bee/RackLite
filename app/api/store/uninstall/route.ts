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
    const body = await req.json() as { installedId: string };
    const { installedId } = body;

    if (!installedId) {
      return NextResponse.json({ error: 'ID instalasi diperlukan' }, { status: 400 });
    }

    const db = getDb();
    const installed = db.prepare('SELECT * FROM installed_applications WHERE id = ?').get(installedId) as
      | {
          id: string;
          application_id: number;
          installed_version: string;
          installation_path: string;
          service_name: string | null;
          port: number | null;
          status: string;
          installed_at: string;
          updated_at: string | null;
        }
      | undefined;

    if (!installed) {
      return NextResponse.json({ error: 'Aplikasi tidak ditemukan' }, { status: 404 });
    }

    const app = db.prepare('SELECT * FROM store_applications WHERE id = ?').get(installed.application_id) as
      | {
          id: number;
          slug: string;
          name: string;
          installation_config: string | null;
        }
      | undefined;

    const taskId = crypto.randomUUID();

    // Create uninstall task
    db.prepare(`
      INSERT INTO installation_tasks (id, application_id, action, status, progress, logs, started_at)
      VALUES (?, ?, 'uninstall', 'running', 0, '', datetime('now'))
    `).run(taskId, installed.application_id);

    // Start uninstallation asynchronously
    const uninstallPromise = runUninstallation(taskId, installed, app);
    uninstallPromise.catch(err => {
      console.error('Uninstallation failed:', err);
      db.prepare(`
        UPDATE installation_tasks SET status = 'failed', error_message = ?, progress = 0, completed_at = datetime('now')
        WHERE id = ?
      `).run(err.message, taskId);
    });

    const user = (req as any).user;
    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'APP_UNINSTALL_START',
      target: `/api/store/uninstall`,
      status: 'success',
      detail: `Started uninstalling ${app?.name || installed.id}`,
      ip: (req as any).ip,
    });

    return NextResponse.json({
      message: 'Uninstall dimulai',
      taskId
    });
  } catch (err) {
    console.error('Uninstall failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memulai uninstall' }, { status: 500 });
  }
}

async function runUninstallation(taskId: string, installed: any, app: any) {
  const db = getDb();

  try {
    await updateTaskProgress(taskId, 10, 'Memulai uninstall...');

    const installConfig = app?.installation_config ? JSON.parse(app.installation_config) : {};
    const installType = installConfig.type || 'package_manager';
    const serviceName = installed.service_name;
    const installPath = installed.installation_path;

    // Stop service if running
    if (serviceName) {
      await updateTaskProgress(taskId, 20, `Menghentikan service ${serviceName}...`);
      const stopResult = await runSystemCommand('systemctl', ['stop', serviceName]);
      if (!stopResult.ok) {
        await updateTaskProgress(taskId, 25, `Gagal menghentikan service: ${stopResult.stderr}`);
      } else {
        await runSystemCommand('systemctl', ['disable', serviceName]);
        // Remove systemd service file
        const servicePath = `/etc/systemd/system/${serviceName}.service`;
        try {
          await fs.unlink(servicePath);
          await runSystemCommand('systemctl', ['daemon-reload']);
        } catch {}
      }
    }

    // Handle different installation types
    if (installType === 'package_manager') {
      await updateTaskProgress(taskId, 40, `Menghapus paket ${installConfig.package}...`);
      const pkg = installConfig.package;
      const isDebian = await checkDebianBased();
      if (isDebian) {
        const result = await runSystemCommand('apt-get', ['remove', '-y', pkg]);
        if (!result.ok) {
          await updateTaskProgress(taskId, 50, `Gagal hapus paket: ${result.stderr}`);
        }
      } else {
        const result = await runSystemCommand('dnf', ['remove', '-y', pkg]);
        if (!result.ok) {
          const yumResult = await runSystemCommand('yum', ['remove', '-y', pkg]);
          if (!yumResult.ok) {
            await updateTaskProgress(taskId, 50, `Gagal hapus paket: ${yumResult.stderr}`);
          }
        }
      }
    } else if (installType === 'docker') {
      await updateTaskProgress(taskId, 40, 'Menghapus container Docker...');
      const downResult = await runSystemCommand('docker', ['compose', 'down', '-v'], { cwd: installPath });
      if (!downResult.ok) {
        await updateTaskProgress(taskId, 50, `Gagal hapus container: ${downResult.stderr}`);
      }
    } else if (installType === 'npm') {
      await updateTaskProgress(taskId, 40, `Menghapus paket npm ${installConfig.package}...`);
      const result = await runSystemCommand('npm', ['uninstall', '-g', installConfig.package]);
      if (!result.ok) {
        await updateTaskProgress(taskId, 50, `Gagal hapus npm: ${result.stderr}`);
      }
    }

    // Remove Nginx vhost if exists
    await updateTaskProgress(taskId, 60, 'Menghapus konfigurasi Nginx...');
    const nginxAvail = '/etc/nginx/sites-available';
    const nginxEnabled = '/etc/nginx/sites-enabled';
    const configName = `app-${app?.slug || installed.id}.conf`;
    try {
      await fs.unlink(path.join(nginxEnabled, configName));
      await fs.unlink(path.join(nginxAvail, configName));
      await runSystemCommand('nginx', ['-s', 'reload']);
    } catch {}

    // Remove installation directory
    await updateTaskProgress(taskId, 80, 'Menghapus direktori instalasi...');
    try {
      await fs.rm(installPath, { recursive: true, force: true });
    } catch (err) {
      await updateTaskProgress(taskId, 85, `Gagal hapus direktori: ${err}`);
    }

    // Remove from installed_applications
    db.prepare('DELETE FROM installed_applications WHERE id = ?').run(installed.id);

    await updateTaskProgress(taskId, 100, 'Uninstall selesai', 'completed');

    const user = { id: 1, username: 'system' };
    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'APP_UNINSTALL_COMPLETE',
      target: `/api/store/uninstall`,
      status: 'success',
      detail: `Uninstalled ${app?.name || installed.id}`,
      ip: '127.0.0.1',
    });

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

async function checkDebianBased(): Promise<boolean> {
  try {
    const result = await runSystemCommand('cat', ['/etc/os-release']);
    return result.ok && (result.stdout.includes('debian') || result.stdout.includes('ubuntu'));
  } catch {
    return false;
  }
}