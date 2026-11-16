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
  smtp_host: string;
  smtp_port: string;
  smtp_secure: string;
  smtp_auth: string;
  smtp_username: string;
  smtp_password: string;
  smtp_from: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: boolean;
  username: string;
  password: string;
  from: string;
}

export interface SshKey {
  id: string;
  name: string;
  fingerprint: string;
  type: string;
  publicKey: string;
  privateKey: string | null;
  createdAt: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: Array<{
    IP: string;
    PublicPort: number;
    PrivatePort: number;
    Type: string;
  }> | null;
  created: number;
  labels: Record<string, string>;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: number;
  created: number;
  labels: Record<string, string>;
}

export interface AppStoreItem {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  latestVersion: string;
  size?: number;
  icon?: string;
  repository: string;
  maintainer: string;
  homepage?: string;
  requiresDatabase?: 'mariadb' | 'postgres' | 'none';
  defaultPort?: number;
}

export interface InstalledApp {
  id: string;
  appId: string;
  name: string;
  version: string;
  status: 'running' | 'stopped' | 'error' | 'installing';
  path: string;
  url?: string;
  database?: {
    engine: 'mariadb' | 'postgres';
    dbName: string;
    dbUser: string;
  };
  installedAt: string;
  updatedAt?: string;
}

export interface StoreApplication {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  developer: string | null;
  latestVersion: string;
  repositoryUrl: string | null;
  officialUrl: string | null;
  documentationUrl: string | null;
  license: string | null;
  requirements: string | null;
  dependencies: string | null;
  installationConfig: string | null;
  isFeatured: number;
  osCompatibility: string | null;
  minRamMb: number | null;
  minStorageMb: number | null;
  requiredPorts: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstalledApplication {
  id: string;
  applicationId: number;
  installedVersion: string;
  installationPath: string;
  serviceName: string | null;
  port: number | null;
  status: 'installed' | 'running' | 'stopped' | 'error' | 'installing' | 'updating' | 'uninstalling';
  installedAt: string;
  updatedAt: string | null;
}

export interface InstallationTask {
  id: string;
  applicationId: number;
  action: 'install' | 'uninstall' | 'start' | 'stop' | 'restart' | 'update';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  logs: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ApplicationVersion {
  id: number;
  applicationId: number;
  version: string;
  releaseNotes: string | null;
  releaseDate: string | null;
  downloadUrl: string | null;
  checksum: string | null;
  createdAt: string;
}

export interface StoreCategories {
  categories: string[];
  counts: Record<string, number>;
}

export interface StoreStats {
  totalAvailable: number;
  totalInstalled: number;
  totalUpdates: number;
  totalCategories: number;
}
