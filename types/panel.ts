export type UserRole = 'admin' | 'user';
export type ThemeMode = 'dark' | 'light';
export type LanguageCode = 'id' | 'en';

export interface PanelUser {
  id: number;
  username: string;
  role: UserRole;
  totp_enabled: boolean;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface SessionPayload {
  sub: string;
  userId: number;
  username: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface SystemMetrics {
  timestamp: number;
  hostname: string;
  platform: string;
  kernel: string;
  uptimeSeconds: number;
  cpu: {
    cores: number;
    model: string;
    usagePercent: number;
    loadAvg: [number, number, number];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    usagePercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapPercent: number;
  };
  disks: Array<{
    filesystem: string;
    mount: string;
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usagePercent: number;
  }>;
  network: {
    rxBytesPerSec: number;
    txBytesPerSec: number;
    totalRxBytes: number;
    totalTxBytes: number;
    interfaces: Array<{
      name: string;
      rxBytes: number;
      txBytes: number;
    }>;
  };
  processes: Array<{
    pid: number;
    user: string;
    cpu: number;
    mem: number;
    command: string;
  }>;
  panelRssMb: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mode: string;
  uid: number;
  gid: number;
  owner: string;
  modifiedAt: string;
}

export interface WebsiteRecord {
  id: number;
  domain: string;
  root_path: string;
  type: 'static' | 'php' | 'proxy';
  proxy_pass: string | null;
  php_version: string | null;
  ssl_enabled: number;
  force_https: number;
  status: string;
  created_at: string;
}

export interface DatabaseRecord {
  id: number;
  engine: 'mariadb' | 'postgres';
  db_name: string;
  db_user: string;
  privilege: string;
  created_at: string;
}

export interface ServiceStatus {
  name: string;
  label: string;
  activeState: 'active' | 'inactive' | 'failed' | 'unknown';
  subState: string;
  enabled: boolean;
  description: string;
  managedBySystemd: boolean;
}

export interface CronJobRecord {
  id: number;
  linux_user: string;
  schedule: string;
  command: string;
  description: string;
  enabled: number;
  created_at: string;
}

export interface FirewallRuleRecord {
  id: number;
  port: string;
  protocol: 'tcp' | 'udp' | 'any';
  action: 'allow' | 'deny';
  source_ip: string;
  comment: string;
  created_at: string;
}

export interface OpenPortInfo {
  protocol: string;
  localAddress: string;
  port: string;
  process: string;
}

export interface BackupRecord {
  id: number;
  name: string;
  backup_type: 'files' | 'database' | 'full';
  target: 'local' | 's3';
  source_path: string;
  file_path: string;
  s3_key: string | null;
  size_bytes: number;
  schedule_cron: string | null;
  status: string;
  created_at: string;
}

export interface AuditLogRecord {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  target: string;
  status: 'success' | 'failed' | 'denied';
  detail: string;
  ip_address: string;
  created_at: string;
}

export interface PanelSettings {
  panel_port: string;
  panel_domain: string;
  ip_whitelist: string;
  theme: ThemeMode;
  language: LanguageCode;
  s3_endpoint: string;
  s3_bucket: string;
  s3_region: string;
  s3_access_key: string;
  s3_secret_key: string;
}
