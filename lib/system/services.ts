import { findBinary, runSystemCommand } from '@/lib/system/exec';
import { SERVICE_NAME_REGEX } from '@/lib/security';
import type { ServiceStatus } from '@/types/panel';

// Daftar service standar yang dipantau dan dikelola panel
export const MANAGED_SERVICES: Array<{
  name: string;
  label: string;
  description: string;
}> = [
  { name: 'nginx', label: 'Nginx Web Server', description: 'HTTP & reverse proxy server' },
  { name: 'mariadb', label: 'MariaDB / MySQL', description: 'Relational database engine' },
  { name: 'postgresql', label: 'PostgreSQL', description: 'Object-relational database server' },
  { name: 'php8.2-fpm', label: 'PHP-FPM 8.2', description: 'FastCGI Process Manager untuk PHP' },
  { name: 'docker', label: 'Docker Engine', description: 'Container runtime daemon' },
  { name: 'ufw', label: 'UFW Firewall', description: 'Uncomplicated Firewall daemon' },
  { name: 'ssh', label: 'OpenSSH Server', description: 'Remote shell access daemon' },
  { name: 'cron', label: 'Cron Scheduler', description: 'Penjadwal tugas berkala Linux' },
];

const ALLOWED_SERVICE_NAMES = new Set(MANAGED_SERVICES.map((s) => s.name));

export async function listServicesStatus(): Promise<{
  systemdAvailable: boolean;
  services: ServiceStatus[];
}> {
  const systemctl = await findBinary('systemctl');
  if (!systemctl) {
    return {
      systemdAvailable: false,
      services: MANAGED_SERVICES.map((svc) => ({
        name: svc.name,
        label: svc.label,
        activeState: 'unknown',
        subState: 'systemd tidak tersedia',
        enabled: false,
        description: svc.description,
        managedBySystemd: false,
      })),
    };
  }

  const results = await Promise.all(
    MANAGED_SERVICES.map(async (svc): Promise<ServiceStatus> => {
      const [activeRes, enabledRes] = await Promise.all([
        runSystemCommand('systemctl', ['is-active', svc.name]),
        runSystemCommand('systemctl', ['is-enabled', svc.name]),
      ]);
      const stateRaw = activeRes.stdout.trim();
      let activeState: ServiceStatus['activeState'] = 'inactive';
      if (stateRaw === 'active') activeState = 'active';
      else if (stateRaw === 'failed') activeState = 'failed';
      else if (!stateRaw && activeRes.code !== 0) activeState = 'unknown';

      return {
        name: svc.name,
        label: svc.label,
        activeState,
        subState: stateRaw || 'inactive',
        enabled: enabledRes.stdout.trim() === 'enabled',
        description: svc.description,
        managedBySystemd: true,
      };
    })
  );

  return { systemdAvailable: true, services: results };
}

export async function controlService(
  serviceName: string,
  action: 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable'
): Promise<{ ok: boolean; message: string }> {
  if (!SERVICE_NAME_REGEX.test(serviceName) || !ALLOWED_SERVICE_NAMES.has(serviceName)) {
    return { ok: false, message: 'Nama service tidak diizinkan.' };
  }

  const res = await runSystemCommand('systemctl', [action, serviceName]);
  if (!res.ok) {
    return { ok: false, message: res.stderr || `Gagal menjalankan systemctl ${action}` };
  }
  return {
    ok: true,
    message: `Perintah systemctl ${action} ${serviceName} berhasil dijalankan.`,
  };
}

export async function readServiceLogs(
  serviceName: string,
  lines = 80
): Promise<{ ok: boolean; logs: string }> {
  if (!SERVICE_NAME_REGEX.test(serviceName) || !ALLOWED_SERVICE_NAMES.has(serviceName)) {
    return { ok: false, logs: 'Nama service tidak valid.' };
  }
  const safeLines = String(Math.min(Math.max(10, lines), 500));
  const res = await runSystemCommand('journalctl', [
    '-u',
    serviceName,
    '-n',
    safeLines,
    '--no-pager',
  ]);
  if (!res.ok) {
    return {
      ok: false,
      logs: res.stderr || 'journalctl tidak tersedia atau tidak memiliki izin membaca log.',
    };
  }
  return { ok: true, logs: res.stdout || '(Belum ada log untuk unit ini)' };
}
