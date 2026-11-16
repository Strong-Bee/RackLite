import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.PANEL_DATA_DIR || './data');
const DB_PATH = path.join(DATA_DIR, 'panel.db');

// Pastikan direktori data dan workspace default tersedia
function ensureDataDirectories() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const workspaceDir = path.join(DATA_DIR, 'workspace');
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, 'README.txt'),
      'Selamat datang di RackLite File Manager.\nAnda dapat mengelola berkas, mengunggah, mengarsipkan ZIP, dan mengedit kode langsung dari panel.\n',
      'utf8'
    );
  }
  fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'nginx'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
}

declare global {
  var __rackliteDb: Database.Database | undefined;
}

function initSchema(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      detail TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      root_path TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'static' CHECK(type IN ('static', 'php', 'proxy')),
      proxy_pass TEXT,
      php_version TEXT,
      ssl_enabled INTEGER NOT NULL DEFAULT 0,
      force_https INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS databases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine TEXT NOT NULL CHECK(engine IN ('mariadb', 'postgres')),
      db_name TEXT NOT NULL,
      db_user TEXT NOT NULL,
      privilege TEXT NOT NULL DEFAULT 'ALL PRIVILEGES',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(engine, db_name)
    );

    CREATE TABLE IF NOT EXISTS cron_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      linux_user TEXT NOT NULL DEFAULT 'root',
      schedule TEXT NOT NULL,
      command TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS firewall_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      port TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'tcp' CHECK(protocol IN ('tcp', 'udp', 'any')),
      action TEXT NOT NULL DEFAULT 'allow' CHECK(action IN ('allow', 'deny')),
      source_ip TEXT NOT NULL DEFAULT 'any',
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      backup_type TEXT NOT NULL CHECK(backup_type IN ('files', 'database', 'full')),
      target TEXT NOT NULL CHECK(target IN ('local', 's3')),
      source_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      s3_key TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      schedule_cron TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed akun admin awal jika tabel users masih kosong
  const countRow = db.prepare('SELECT COUNT(*) as total FROM users').get() as {
    total: number;
  };
  if (countRow.total === 0) {
    const adminUser = (process.env.PANEL_ADMIN_USER || 'admin').toLowerCase();
    const adminPass = process.env.PANEL_ADMIN_PASS || 'admin12345';
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare(
      'INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, ?, 1)'
    ).run(adminUser, hash, 'admin');
  }

  // Seed pengaturan bawaan panel
  const defaultSettings: Record<string, string> = {
    panel_port: process.env.PORT || '3000',
    panel_domain: 'localhost',
    ip_whitelist: '',
    theme: 'dark',
    language: 'id',
    s3_endpoint: '',
    s3_bucket: '',
    s3_region: 'us-east-1',
    s3_access_key: '',
    s3_secret_key: '',
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }
}

export function getDb(): Database.Database {
  if (!globalThis.__rackliteDb) {
    ensureDataDirectories();
    const db = new Database(DB_PATH);
    initSchema(db);
    globalThis.__rackliteDb = db;
  }
  return globalThis.__rackliteDb;
}

export function getDataDir(): string {
  ensureDataDirectories();
  return DATA_DIR;
}

export function writePanelLog(level: 'INFO' | 'WARN' | 'ERROR', message: string) {
  try {
    ensureDataDirectories();
    const logPath = path.join(DATA_DIR, 'logs', 'panel.log');
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    fs.appendFileSync(logPath, line, 'utf8');
  } catch {
    // Abaikan kegagalan logging non-kritis
  }
}
