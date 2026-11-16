import fs from 'node:fs/promises';
import path from 'node:path';
import { getDataDir } from '@/lib/db';
import { findBinary, runSystemCommand } from '@/lib/system/exec';
import { DOMAIN_REGEX } from '@/lib/security';

export interface NginxVhostInput {
  domain: string;
  rootPath: string;
  type: 'static' | 'php' | 'proxy';
  proxyPass?: string;
  phpVersion?: string;
  forceHttps?: boolean;
  sslEnabled?: boolean;
}

export function buildNginxConfigContent(input: NginxVhostInput): string {
  const { domain, rootPath, type, proxyPass, phpVersion, forceHttps, sslEnabled } =
    input;

  let locationBlock = `
    location / {
        try_files $uri $uri/ =404;
    }`;

  if (type === 'php') {
    const ver = phpVersion || '8.2';
    locationBlock = `
    index index.php index.html index.htm;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php${ver}-fpm.sock;
    }

    location ~ /\\.ht {
        deny all;
    }`;
  } else if (type === 'proxy' && proxyPass) {
    locationBlock = `
    location / {
        proxy_pass ${proxyPass};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }`;
  }

  if (sslEnabled) {
    const redirectServer = forceHttps
      ? `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}

`
      : '';

    return `${redirectServer}server {
    listen ${forceHttps ? '443 ssl http2' : '80;\n    listen 443 ssl http2'};
    server_name ${domain};
    root ${rootPath};

    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
${locationBlock}
}
`;
  }

  return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    root ${rootPath};

    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
${locationBlock}
}
`;
}

async function getNginxTargetDirs(): Promise<{
  availableDir: string;
  enabledDir: string;
  isSystemDir: boolean;
}> {
  const sysAvailable = '/etc/nginx/sites-available';
  const sysEnabled = '/etc/nginx/sites-enabled';
  try {
    await fs.access(sysAvailable, fs.constants.W_OK);
    await fs.access(sysEnabled, fs.constants.W_OK);
    return {
      availableDir: sysAvailable,
      enabledDir: sysEnabled,
      isSystemDir: true,
    };
  } catch {
    const localDir = path.join(getDataDir(), 'nginx');
    await fs.mkdir(localDir, { recursive: true });
    return {
      availableDir: localDir,
      enabledDir: localDir,
      isSystemDir: false,
    };
  }
}

export async function applyNginxVhost(input: NginxVhostInput): Promise<{
  configPath: string;
  reloaded: boolean;
  message: string;
}> {
  if (!DOMAIN_REGEX.test(input.domain)) {
    throw new Error('Nama domain tidak valid.');
  }

  const content = buildNginxConfigContent(input);
  const { availableDir, enabledDir, isSystemDir } = await getNginxTargetDirs();
  const configPath = path.join(availableDir, `${input.domain}.conf`);
  await fs.writeFile(configPath, content, 'utf8');

  if (isSystemDir) {
    const enabledPath = path.join(enabledDir, `${input.domain}.conf`);
    try {
      await fs.unlink(enabledPath);
    } catch {
      // Abaikan jika symlink belum ada
    }
    await fs.symlink(configPath, enabledPath);

    const testRes = await runSystemCommand('nginx', ['-t']);
    if (!testRes.ok) {
      return {
        configPath,
        reloaded: false,
        message: `Konfigurasi tersimpan, namun nginx -t gagal: ${testRes.stderr}`,
      };
    }

    const reloadRes = await runSystemCommand('systemctl', ['reload', 'nginx']);
    if (!reloadRes.ok) {
      await runSystemCommand('nginx', ['-s', 'reload']);
    }
    return {
      configPath,
      reloaded: true,
      message: `Virtual host ${input.domain} diterapkan dan Nginx di-reload.`,
    };
  }

  return {
    configPath,
    reloaded: false,
    message: `Konfigurasi Nginx ditulis ke ${configPath} (direktori sistem /etc/nginx tidak writable oleh user saat ini).`,
  };
}

export async function removeNginxVhost(domain: string): Promise<string> {
  if (!DOMAIN_REGEX.test(domain)) {
    throw new Error('Nama domain tidak valid.');
  }
  const { availableDir, enabledDir, isSystemDir } = await getNginxTargetDirs();
  const availPath = path.join(availableDir, `${domain}.conf`);
  const enabledPath = path.join(enabledDir, `${domain}.conf`);

  await fs.unlink(enabledPath).catch(() => {});
  await fs.unlink(availPath).catch(() => {});

  if (isSystemDir) {
    const testRes = await runSystemCommand('nginx', ['-t']);
    if (testRes.ok) {
      await runSystemCommand('systemctl', ['reload', 'nginx']);
    }
    return `Virtual host ${domain} dihapus dan Nginx di-reload.`;
  }

  return `Konfigurasi lokal ${domain}.conf dihapus.`;
}

export async function issueLetsEncryptSsl(
  domain: string,
  email: string,
  forceHttps: boolean
): Promise<{ ok: boolean; message: string }> {
  if (!DOMAIN_REGEX.test(domain)) {
    return { ok: false, message: 'Domain tidak valid.' };
  }
  const certbotPath = await findBinary('certbot');
  if (!certbotPath) {
    return {
      ok: false,
      message:
        'Biner certbot tidak ditemukan di sistem. Jalankan scripts/install.sh pada VPS untuk mengaktifkan SSL Let’s Encrypt otomatis.',
    };
  }

  const args = [
    '--nginx',
    '-d',
    domain,
    '--non-interactive',
    '--agree-tos',
    '-m',
    email,
    forceHttps ? '--redirect' : '--no-redirect',
  ];

  const res = await runSystemCommand('certbot', args, { timeoutMs: 60000 });
  if (!res.ok) {
    return { ok: false, message: `Certbot gagal: ${res.stderr}` };
  }

  // Pastikan timer auto-renew aktif
  await runSystemCommand('systemctl', ['enable', '--now', 'certbot.timer']);
  return {
    ok: true,
    message: `Sertifikat SSL Let's Encrypt untuk ${domain} berhasil diterbitkan dengan auto-renew.`,
  };
}
