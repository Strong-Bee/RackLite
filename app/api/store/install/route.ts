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
          description: string;
          category: string;
          icon: string | null;
          developer: string | null;
          latest_version: string;
          repository_url: string | null;
          official_url: string | null;
          documentation_url: string | null;
          license: string | null;
          requirements: string | null;
          dependencies: string | null;
          installation_config: string | null;
          is_featured: number;
          os_compatibility: string | null;
          min_ram_mb: number | null;
          min_storage_mb: number | null;
          required_ports: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!app) {
      return NextResponse.json({ error: 'Aplikasi tidak ditemukan' }, { status: 404 });
    }

    // Check if already installed
    const existing = db.prepare('SELECT id FROM installed_applications WHERE application_id = ?').get(app.id);
    if (existing) {
      return NextResponse.json({ error: 'Aplikasi sudah terinstal' }, { status: 409 });
    }

    // Check OS compatibility
    const osCompat = app.os_compatibility ? JSON.parse(app.os_compatibility) : [];
    if (osCompat.length > 0 && !osCompat.includes(process.platform === 'win32' ? 'windows' : 'linux')) {
      return NextResponse.json({ error: `Aplikasi tidak kompatibel dengan ${process.platform}` }, { status: 400 });
    }

    // Check dependencies
    const dependencies = app.dependencies ? JSON.parse(app.dependencies) : [];
    for (const dep of dependencies) {
      const depApp = db.prepare('SELECT id FROM store_applications WHERE slug = ?').get(dep);
      if (depApp) {
        const depInstalled = db.prepare('SELECT id FROM installed_applications WHERE application_id = ?').get((depApp as any).id);
        if (!depInstalled) {
          return NextResponse.json({ error: `Dependensi ${dep} belum terinstal` }, { status: 400 });
        }
      }
    }

    // Check system resources (simplified)
    if (app.min_ram_mb) {
      const memResult = await runSystemCommand('free', ['-m']);
      if (memResult.ok) {
        const lines = memResult.stdout.trim().split('\n');
        const memLine = lines[1].split(/\s+/);
        const availableMb = parseInt(memLine[6]) || parseInt(memLine[3]);
        if (availableMb < app.min_ram_mb) {
          return NextResponse.json({ error: `RAM tidak mencukupi. Dibutuhkan minimal ${app.min_ram_mb}MB, tersedia ${availableMb}MB` }, { status: 400 });
        }
      }
    }

    // Check disk space
    if (app.min_storage_mb) {
      const diskResult = await runSystemCommand('df', ['-m', path.resolve(process.env.PANEL_DATA_DIR || './data')]);
      if (diskResult.ok) {
        const lines = diskResult.stdout.trim().split('\n');
        const diskLine = lines[1].split(/\s+/);
        const availableMb = parseInt(diskLine[3]);
        if (availableMb < app.min_storage_mb) {
          return NextResponse.json({ error: `Storage tidak mencukupi. Dibutuhkan minimal ${app.min_storage_mb}MB, tersedia ${availableMb}MB` }, { status: 400 });
        }
      }
    }

    // Check port availability
    const requiredPorts = app.required_ports ? JSON.parse(app.required_ports) : [];
    for (const port of requiredPorts) {
      const portResult = await runSystemCommand('ss', ['-tuln', `| grep :${port}`]);
      if (portResult.ok && portResult.stdout.trim()) {
        return NextResponse.json({ error: `Port ${port} sudah digunakan` }, { status: 400 });
      }
    }

    const taskId = crypto.randomUUID();
    const installVersion = version || app.latest_version;
    const installConfig = app.installation_config ? JSON.parse(app.installation_config) : {};

    // Create installation task
    db.prepare(`
      INSERT INTO installation_tasks (id, application_id, action, status, progress, logs, started_at)
      VALUES (?, ?, 'install', 'running', 0, '', datetime('now'))
    `).run(taskId, app.id);

    // Start installation asynchronously
    const installPromise = runInstallation(taskId, app, installVersion, installConfig);
    installPromise.catch(err => {
      console.error('Installation failed:', err);
      db.prepare(`
        UPDATE installation_tasks SET status = 'failed', error_message = ?, progress = 0, completed_at = datetime('now')
        WHERE id = ?
      `).run(err.message, taskId);
    });

    const user = (req as any).user;
    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'APP_INSTALL_START',
      target: `/api/store/install`,
      status: 'success',
      detail: `Started installing ${app.name} v${installVersion}`,
      ip: (req as any).ip,
    });

    return NextResponse.json({
      message: 'Instalasi dimulai',
      taskId,
      app: {
        id: String(app.id),
        slug: app.slug,
        name: app.name,
        version: installVersion,
      }
    });
  } catch (err) {
    console.error('Install failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memulai instalasi' }, { status: 500 });
  }
}

async function runInstallation(taskId: string, app: any, version: string, installConfig: any) {
  const db = getDb();
  const appsRoot = path.resolve(process.env.PANEL_DATA_DIR || './data', 'apps', app.slug);

  try {
    await updateTaskProgress(taskId, 10, 'Menyiapkan direktori instalasi...');
    await fs.mkdir(appsRoot, { recursive: true });

    await updateTaskProgress(taskId, 20, 'Mengecek konfigurasi instalasi...');

    const installType = installConfig.type || 'package_manager';
    let logs = '';
    let serviceName = installConfig.service || app.slug;
    let port = installConfig.port || null;

    if (installType === 'package_manager') {
      await updateTaskProgress(taskId, 30, `Menginstal paket ${installConfig.package}...`);
      const pkg = installConfig.package;
      const result = await runPackageInstall(pkg);
      logs += `\n${result}`;
      if (!result.includes('installed') && !result.includes('already')) {
        throw new Error(`Gagal menginstal paket: ${result}`);
      }

      if (installConfig.service) {
        await updateTaskProgress(taskId, 70, `Memulai service ${installConfig.service}...`);
        const startResult = await runSystemCommand('systemctl', ['start', installConfig.service]);
        if (!startResult.ok) {
          logs += `\nGagal memulai service: ${startResult.stderr}`;
        } else {
          await runSystemCommand('systemctl', ['enable', installConfig.service]);
        }
      }
    } else if (installType === 'binary') {
      await updateTaskProgress(taskId, 30, 'Mengunduh binary...');
      const downloadUrl = installConfig.download_url;
      const binaryPath = path.join(appsRoot, path.basename(downloadUrl));

      const downloadResult = await runSystemCommand('curl', ['-L', '-o', binaryPath, downloadUrl]);
      if (!downloadResult.ok) {
        throw new Error(`Gagal mengunduh: ${downloadResult.stderr}`);
      }
      logs += `\nDownloaded to ${binaryPath}`;

      await updateTaskProgress(taskId, 50, 'Mengekstrak binary...');
      if (binaryPath.endsWith('.tar.gz') || binaryPath.endsWith('.tgz')) {
        const extractResult = await runSystemCommand('tar', ['-xzf', binaryPath, '-C', appsRoot]);
        if (!extractResult.ok) throw new Error(`Gagal ekstrak: ${extractResult.stderr}`);
      } else if (binaryPath.endsWith('.zip')) {
        const extractResult = await runSystemCommand('unzip', ['-o', binaryPath, '-d', appsRoot]);
        if (!extractResult.ok) throw new Error(`Gagal ekstrak: ${extractResult.stderr}`);
      }
      logs += `\nExtracted to ${appsRoot}`;

      if (installConfig.service) {
        await updateTaskProgress(taskId, 70, `Mengkonfigurasi service ${installConfig.service}...`);
        await setupSystemdService(app.slug, installConfig, appsRoot);
        const startResult = await runSystemCommand('systemctl', ['start', installConfig.service]);
        if (!startResult.ok) {
          logs += `\nGagal memulai service: ${startResult.stderr}`;
        } else {
          await runSystemCommand('systemctl', ['enable', installConfig.service]);
        }
      }
    } else if (installType === 'docker') {
      await updateTaskProgress(taskId, 30, `Membuat docker-compose untuk ${app.name}...`);
      await setupDockerCompose(app.slug, installConfig, appsRoot);

      await updateTaskProgress(taskId, 50, 'Menarik image Docker...');
      const pullResult = await runSystemCommand('docker', ['pull', installConfig.image]);
      if (!pullResult.ok) throw new Error(`Gagal pull image: ${pullResult.stderr}`);
      logs += `\nPulled image ${installConfig.image}`;

      await updateTaskProgress(taskId, 70, 'Memulai container...');
      const upResult = await runSystemCommand('docker', ['compose', 'up', '-d'], { cwd: appsRoot, timeoutMs: 120000 });
      if (!upResult.ok) throw new Error(`Gagal start container: ${upResult.stderr}`);
      logs += `\nContainer started`;
    } else if (installType === 'npm') {
      await updateTaskProgress(taskId, 30, `Menginstal paket npm ${installConfig.package}...`);
      const npmResult = await runSystemCommand('npm', ['install', '-g', installConfig.package]);
      if (!npmResult.ok) throw new Error(`Gagal npm install: ${npmResult.stderr}`);
      logs += `\nInstalled npm package ${installConfig.package}`;
    } else if (installType === 'webapp') {
      await updateTaskProgress(taskId, 30, 'Mengunduh aplikasi web...');
      const downloadUrl = installConfig.download_url;
      const destPath = path.join(appsRoot, path.basename(downloadUrl));

      const downloadResult = await runSystemCommand('curl', ['-L', '-o', destPath, downloadUrl]);
      if (!downloadResult.ok) throw new Error(`Gagal unduh: ${downloadResult.stderr}`);

      await updateTaskProgress(taskId, 50, 'Mengekstrak aplikasi...');
      if (destPath.endsWith('.tar.gz') || destPath.endsWith('.tgz') || destPath.endsWith('.tar.bz2')) {
        const extractResult = await runSystemCommand('tar', ['-xf', destPath, '-C', appsRoot]);
        if (!extractResult.ok) throw new Error(`Gagal ekstrak: ${extractResult.stderr}`);
      } else if (destPath.endsWith('.zip')) {
        const extractResult = await runSystemCommand('unzip', ['-o', destPath, '-d', appsRoot]);
        if (!extractResult.ok) throw new Error(`Gagal ekstrak: ${extractResult.stderr}`);
      } else if (destPath.endsWith('.php')) {
        // Single PHP file
        await fs.rename(destPath, path.join(appsRoot, 'index.php'));
      }
      logs += `\nWeb app extracted to ${appsRoot}`;

      // Setup Nginx vhost for webapp
      if (installConfig.port) {
        await updateTaskProgress(taskId, 70, 'Mengkonfigurasi Nginx...');
        await setupNginxVhost(app.slug, installConfig.port, appsRoot);
      }
    } else if (installType === 'bundled') {
      // Bundled with another package (e.g., npm with nodejs)
      await updateTaskProgress(taskId, 50, `Paket ${installConfig.package} sudah termasuk dalam ${installConfig.with}`);
      logs += `\nBundled with ${installConfig.with}`;
    }

    await updateTaskProgress(taskId, 90, 'Verifikasi instalasi...');

    // Save installed application record
    const installedId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO installed_applications (id, application_id, installed_version, installation_path, service_name, port, status, installed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', datetime('now'))
    `).run(installedId, app.id, version, appsRoot, serviceName, port);

    await updateTaskProgress(taskId, 100, 'Instalasi selesai', 'completed');

    const user = { id: 1, username: 'system' }; // System user for async task
    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'APP_INSTALL_COMPLETE',
      target: `/api/store/install`,
      status: 'success',
      detail: `Installed ${app.name} v${version}`,
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

async function runPackageInstall(pkg: string): Promise<string> {
  const isDebian = await checkDebianBased();
  if (isDebian) {
    const updateResult = await runSystemCommand('apt-get', ['update']);
    if (!updateResult.ok) return `apt update failed: ${updateResult.stderr}`;
    const installResult = await runSystemCommand('apt-get', ['install', '-y', pkg]);
    return installResult.ok ? installResult.stdout : installResult.stderr;
  } else {
    // Try yum/dnf for RHEL-based
    const installResult = await runSystemCommand('dnf', ['install', '-y', pkg]);
    if (!installResult.ok) {
      const yumResult = await runSystemCommand('yum', ['install', '-y', pkg]);
      return yumResult.ok ? yumResult.stdout : yumResult.stderr;
    }
    return installResult.stdout;
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

async function setupSystemdService(appSlug: string, installConfig: any, appsRoot: string) {
  const serviceName = installConfig.service || appSlug;
  const serviceContent = `[Unit]
Description=${installConfig.description || serviceName}
After=network.target

[Service]
Type=simple
ExecStart=${installConfig.exec_start || path.join(appsRoot, serviceName)}
WorkingDirectory=${appsRoot}
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
`;

  const servicePath = `/etc/systemd/system/${serviceName}.service`;
  await fs.writeFile(servicePath, serviceContent);
  await runSystemCommand('systemctl', ['daemon-reload']);
}

async function setupDockerCompose(appSlug: string, installConfig: any, appsRoot: string) {
  let composeContent = `version: '3.8'\nservices:\n  ${appSlug}:\n    image: ${installConfig.image}\n    container_name: ${appSlug}\n    restart: unless-stopped\n`;

  if (installConfig.port) {
    composeContent += `    ports:\n      - "${installConfig.port}:${installConfig.port}"\n`;
  }

  if (installConfig.volumes) {
    composeContent += `    volumes:\n`;
    for (const vol of installConfig.volumes) {
      composeContent += `      - ${vol}\n`;
    }
  }

  if (installConfig.environment) {
    composeContent += `    environment:\n`;
    for (const [key, value] of Object.entries(installConfig.environment)) {
      composeContent += `      ${key}: ${value}\n`;
    }
  }

  await fs.writeFile(path.join(appsRoot, 'docker-compose.yml'), composeContent);
}

async function setupNginxVhost(appSlug: string, port: number, appsRoot: string) {
  const nginxAvail = '/etc/nginx/sites-available';
  const nginxEnabled = '/etc/nginx/sites-enabled';
  const configName = `app-${appSlug}.conf`;
  const configPath = path.join(nginxAvail, configName);
  const enabledPath = path.join(nginxEnabled, configName);

  const config = `server {
    listen 80;
    server_name ${appSlug}.localhost;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
`;

  await fs.writeFile(configPath, config);
  try { await fs.unlink(enabledPath); } catch {}
  await fs.symlink(configPath, enabledPath);
  await runSystemCommand('nginx', ['-s', 'reload']);
}