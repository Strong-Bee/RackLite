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
  fs.mkdirSync(path.join(DATA_DIR, 'apps'), { recursive: true });
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

    CREATE TABLE IF NOT EXISTS ssh_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      type TEXT NOT NULL,
      public_key TEXT NOT NULL,
      private_key TEXT,
      passphrase TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT,
      developer TEXT,
      latest_version TEXT NOT NULL,
      repository_url TEXT,
      official_url TEXT,
      documentation_url TEXT,
      license TEXT,
      requirements TEXT,
      dependencies TEXT,
      installation_config TEXT,
      is_featured INTEGER NOT NULL DEFAULT 0,
      os_compatibility TEXT,
      min_ram_mb INTEGER,
      min_storage_mb INTEGER,
      required_ports TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_store_apps_category ON store_applications(category);
    CREATE INDEX IF NOT EXISTS idx_store_apps_featured ON store_applications(is_featured);

    CREATE TABLE IF NOT EXISTS installed_applications (
      id TEXT PRIMARY KEY,
      application_id INTEGER NOT NULL,
      installed_version TEXT NOT NULL,
      installation_path TEXT NOT NULL,
      service_name TEXT,
      port INTEGER,
      status TEXT NOT NULL DEFAULT 'installed' CHECK(status IN ('installed', 'running', 'stopped', 'error', 'installing', 'updating', 'uninstalling')),
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (application_id) REFERENCES store_applications(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_installed_app_id ON installed_applications(application_id);

    CREATE TABLE IF NOT EXISTS installation_tasks (
      id TEXT PRIMARY KEY,
      application_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('install', 'uninstall', 'start', 'stop', 'restart', 'update')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
      progress INTEGER NOT NULL DEFAULT 0,
      logs TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (application_id) REFERENCES store_applications(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_install_tasks_app ON installation_tasks(application_id);
    CREATE INDEX IF NOT EXISTS idx_install_tasks_status ON installation_tasks(status);

    CREATE TABLE IF NOT EXISTS application_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      release_notes TEXT,
      release_date TEXT,
      download_url TEXT,
      checksum TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES store_applications(id) ON DELETE CASCADE,
      UNIQUE(application_id, version)
    );

    CREATE INDEX IF NOT EXISTS idx_app_versions_app ON application_versions(application_id);

    -- Security: Track login attempts for threat detection
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL,
      username TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      user_agent TEXT,
      country_code TEXT,
      region TEXT,
      city TEXT,
      asn TEXT,
      is_vpn INTEGER DEFAULT 0,
      is_proxy INTEGER DEFAULT 0,
      is_tor INTEGER DEFAULT 0,
      threat_score INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_success ON login_attempts(success);

    -- Security: Auto-blocked IPs
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      threat_score INTEGER DEFAULT 0,
      attempts_count INTEGER DEFAULT 0,
      blocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      is_permanent INTEGER DEFAULT 0,
      created_by TEXT DEFAULT 'auto'
    );

    CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip_address);
    CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires ON blocked_ips(expires_at);

    -- Security: Security events log
    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'critical')),
      ip_address TEXT,
      username TEXT,
      details TEXT NOT NULL,
      raw_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
    CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);

    -- Security: Threat intelligence cache
    CREATE TABLE IF NOT EXISTS threat_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator_type TEXT NOT NULL CHECK(indicator_type IN ('ip', 'cidr', 'asn', 'country')),
      indicator_value TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence INTEGER DEFAULT 50,
      tags TEXT,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_threat_intel_type_value ON threat_intel(indicator_type, indicator_value);
    CREATE INDEX IF NOT EXISTS idx_threat_intel_active ON threat_intel(is_active);
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
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_auth: 'true',
    smtp_username: '',
    smtp_password: '',
    smtp_from: '',
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Seed store applications catalog
  const storeApps = [
    // Web Server
    {
      slug: 'nginx',
      name: 'Nginx',
      description: 'Web server dan reverse proxy performa tinggi dengan dukungan HTTP/2, SSL/TLS, dan load balancing.',
      category: 'Web Server',
      icon: 'nginx',
      developer: 'Nginx Inc.',
      latest_version: '1.26.0',
      repository_url: 'https://nginx.org',
      official_url: 'https://nginx.org',
      documentation_url: 'https://nginx.org/en/docs/',
      license: 'BSD-2-Clause',
      requirements: 'Linux/Unix/Windows, root privileges untuk port 80/443',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"nginx","service":"nginx","port":80}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 50,
      min_storage_mb: 20,
      required_ports: '[80,443]',
    },
    {
      slug: 'apache',
      name: 'Apache HTTP Server',
      description: 'Web server paling populer dengan modular architecture dan dukungan luas modul.',
      category: 'Web Server',
      icon: 'apache',
      developer: 'Apache Software Foundation',
      latest_version: '2.4.62',
      repository_url: 'https://httpd.apache.org',
      official_url: 'https://httpd.apache.org',
      documentation_url: 'https://httpd.apache.org/docs/',
      license: 'Apache-2.0',
      requirements: 'Linux/Unix/Windows, root privileges untuk port 80/443',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"apache2","service":"apache2","port":80}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 30,
      required_ports: '[80,443]',
    },
    {
      slug: 'caddy',
      name: 'Caddy',
      description: 'Web server modern dengan HTTPS otomatis via Let\'s Encrypt dan konfigurasi sederhana.',
      category: 'Web Server',
      icon: 'caddy',
      developer: 'Light Code Labs',
      latest_version: '2.8.4',
      repository_url: 'https://caddyserver.com',
      official_url: 'https://caddyserver.com',
      documentation_url: 'https://caddyserver.com/docs/',
      license: 'Apache-2.0',
      requirements: 'Linux/Unix/Windows, root privileges untuk port 80/443',
      dependencies: '[]',
      installation_config: '{"type":"binary","download_url":"https://github.com/caddyserver/caddy/releases/download/v2.8.4/caddy_2.8.4_linux_amd64.tar.gz","service":"caddy","port":80}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 50,
      min_storage_mb: 30,
      required_ports: '[80,443]',
    },
    {
      slug: 'openlitespeed',
      name: 'OpenLiteSpeed',
      description: 'Web server event-driven dengan performa tinggi dan panel admin bawaan.',
      category: 'Web Server',
      icon: 'openlitespeed',
      developer: 'LiteSpeed Technologies',
      latest_version: '1.8.2',
      repository_url: 'https://openlitespeed.org',
      official_url: 'https://openlitespeed.org',
      documentation_url: 'https://openlitespeed.org/kb/',
      license: 'GPL-3.0',
      requirements: 'Linux, root privileges untuk port 80/443',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"openlitespeed","service":"lsws","port":8088}',
      is_featured: 0,
      os_compatibility: '["linux"]',
      min_ram_mb: 200,
      min_storage_mb: 100,
      required_ports: '[8088,7080]',
    },

    // Database
    {
      slug: 'mysql',
      name: 'MySQL',
      description: 'Database relasional paling populer di dunia untuk aplikasi web dan enterprise.',
      category: 'Database',
      icon: 'mysql',
      developer: 'Oracle Corporation',
      latest_version: '8.0.39',
      repository_url: 'https://mysql.com',
      official_url: 'https://mysql.com',
      documentation_url: 'https://dev.mysql.com/doc/',
      license: 'GPL-2.0',
      requirements: 'Linux/Windows, minimal 1GB RAM untuk production',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"mysql-server","service":"mysql","port":3306}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 1000,
      min_storage_mb: 2000,
      required_ports: '[3306]',
    },
    {
      slug: 'mariadb',
      name: 'MariaDB',
      description: 'Drop-in replacement MySQL yang dikembangkan komunitas dengan performa dan fitur lebih baik.',
      category: 'Database',
      icon: 'mariadb',
      developer: 'MariaDB Foundation',
      latest_version: '11.5.2',
      repository_url: 'https://mariadb.org',
      official_url: 'https://mariadb.org',
      documentation_url: 'https://mariadb.com/kb/en/documentation/',
      license: 'GPL-2.0',
      requirements: 'Linux/Windows, minimal 512MB RAM',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"mariadb-server","service":"mariadb","port":3306}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 500,
      min_storage_mb: 1000,
      required_ports: '[3306]',
    },
    {
      slug: 'postgresql',
      name: 'PostgreSQL',
      description: 'Database relasional advanced dengan dukungan JSON, full-text search, dan extensibility.',
      category: 'Database',
      icon: 'postgresql',
      developer: 'PostgreSQL Global Development Group',
      latest_version: '16.4',
      repository_url: 'https://postgresql.org',
      official_url: 'https://postgresql.org',
      documentation_url: 'https://www.postgresql.org/docs/',
      license: 'PostgreSQL License',
      requirements: 'Linux/Windows, minimal 512MB RAM',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"postgresql","service":"postgresql","port":5432}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 500,
      min_storage_mb: 1000,
      required_ports: '[5432]',
    },
    {
      slug: 'mongodb',
      name: 'MongoDB',
      description: 'Database NoSQL document-oriented dengan skema fleksibel dan scaling horizontal.',
      category: 'Database',
      icon: 'mongodb',
      developer: 'MongoDB Inc.',
      latest_version: '7.0.12',
      repository_url: 'https://mongodb.com',
      official_url: 'https://mongodb.com',
      documentation_url: 'https://www.mongodb.com/docs/',
      license: 'SSPL-1.0',
      requirements: 'Linux/Windows, minimal 2GB RAM',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"mongodb-org","service":"mongod","port":27017}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 2000,
      min_storage_mb: 2000,
      required_ports: '[27017]',
    },
    {
      slug: 'redis',
      name: 'Redis',
      description: 'In-memory data structure store untuk caching, session, dan real-time analytics.',
      category: 'Database',
      icon: 'redis',
      developer: 'Redis Ltd.',
      latest_version: '7.4.1',
      repository_url: 'https://redis.io',
      official_url: 'https://redis.io',
      documentation_url: 'https://redis.io/docs/',
      license: 'BSD-3-Clause',
      requirements: 'Linux/Windows, RAM tersedia sesuai dataset',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"redis-server","service":"redis-server","port":6379}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 256,
      min_storage_mb: 50,
      required_ports: '[6379]',
    },

    // Runtime
    {
      slug: 'nodejs',
      name: 'Node.js',
      description: 'JavaScript runtime untuk server-side development dengan ekosistem npm terbesar.',
      category: 'Runtime',
      icon: 'nodejs',
      developer: 'OpenJS Foundation',
      latest_version: '22.11.0',
      repository_url: 'https://nodejs.org',
      official_url: 'https://nodejs.org',
      documentation_url: 'https://nodejs.org/en/docs/',
      license: 'MIT',
      requirements: 'Linux/Windows/macOS',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"nodejs","version":"22"}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 200,
      required_ports: '[]',
    },
    {
      slug: 'php',
      name: 'PHP',
      description: 'Scripting language server-side paling populer untuk web development.',
      category: 'Runtime',
      icon: 'php',
      developer: 'The PHP Group',
      latest_version: '8.3.12',
      repository_url: 'https://php.net',
      official_url: 'https://php.net',
      documentation_url: 'https://www.php.net/docs.php',
      license: 'PHP-3.01',
      requirements: 'Linux/Windows',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"php8.3-fpm","service":"php8.3-fpm"}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 100,
      required_ports: '[]',
    },
    {
      slug: 'python',
      name: 'Python',
      description: 'Bahasa pemrograman general-purpose dengan ekosistem luas untuk data science, AI, dan web.',
      category: 'Runtime',
      icon: 'python',
      developer: 'Python Software Foundation',
      latest_version: '3.12.5',
      repository_url: 'https://python.org',
      official_url: 'https://python.org',
      documentation_url: 'https://docs.python.org/3/',
      license: 'PSF-2.0',
      requirements: 'Linux/Windows/macOS',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"python3"}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 50,
      min_storage_mb: 100,
      required_ports: '[]',
    },
    {
      slug: 'go',
      name: 'Go',
      description: 'Bahasa pemrograman compiled dengan concurrency built-in untuk microservices dan CLI.',
      category: 'Runtime',
      icon: 'go',
      developer: 'The Go Authors',
      latest_version: '1.23.1',
      repository_url: 'https://golang.org',
      official_url: 'https://golang.org',
      documentation_url: 'https://go.dev/doc/',
      license: 'BSD-3-Clause',
      requirements: 'Linux/Windows/macOS',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"golang"}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 300,
      required_ports: '[]',
    },
    {
      slug: 'bun',
      name: 'Bun',
      description: 'JavaScript runtime modern yang cepat, all-in-one dengan bundler dan test runner.',
      category: 'Runtime',
      icon: 'bun',
      developer: 'Oven SH',
      latest_version: '1.1.34',
      repository_url: 'https://bun.sh',
      official_url: 'https://bun.sh',
      documentation_url: 'https://bun.sh/docs',
      license: 'MIT',
      requirements: 'Linux/macOS/Windows (WSL)',
      dependencies: '[]',
      installation_config: '{"type":"binary","download_url":"https://bun.sh/install.sh"}',
      is_featured: 0,
      os_compatibility: '["linux"]',
      min_ram_mb: 100,
      min_storage_mb: 100,
      required_ports: '[]',
    },

    // Web Framework
    {
      slug: 'laravel',
      name: 'Laravel',
      description: 'PHP framework elegant dengan ekosistem lengkap untuk aplikasi web modern dan API.',
      category: 'Web Framework',
      icon: 'laravel',
      developer: 'Laravel Team',
      latest_version: '11.x',
      repository_url: 'https://laravel.com',
      official_url: 'https://laravel.com',
      documentation_url: 'https://laravel.com/docs',
      license: 'MIT',
      requirements: 'PHP 8.2+, Composer, MySQL/PostgreSQL/SQLite, Web server (Nginx/Apache)',
      dependencies: '["php", "composer", "mysql"]',
      installation_config: '{"type":"composer","package":"laravel/laravel","version":"11.x","port":80}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 256,
      min_storage_mb: 500,
      required_ports: '[80]',
    },
    {
      slug: 'codeigniter',
      name: 'CodeIgniter 4',
      description: 'PHP framework lightweight dan cepat dengan footprint kecil untuk performa tinggi.',
      category: 'Web Framework',
      icon: 'codeigniter',
      developer: 'CodeIgniter Foundation',
      latest_version: '4.5.2',
      repository_url: 'https://codeigniter.com',
      official_url: 'https://codeigniter.com',
      documentation_url: 'https://codeigniter4.github.io/userguide/',
      license: 'MIT',
      requirements: 'PHP 8.1+, Composer, MySQL/PostgreSQL/SQLite, Web server (Nginx/Apache)',
      dependencies: '["php", "composer", "mysql"]',
      installation_config: '{"type":"composer","package":"codeigniter4/appstarter","version":"4.5.2","port":80}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 128,
      min_storage_mb: 200,
      required_ports: '[80]',
    },

    // Development Tools
    {
      slug: 'git',
      name: 'Git',
      description: 'Sistem kontrol versi terdistribusi standar industri untuk kolaborasi kode.',
      category: 'Development Tools',
      icon: 'git',
      developer: 'Junio Hamano et al.',
      latest_version: '2.46.0',
      repository_url: 'https://git-scm.com',
      official_url: 'https://git-scm.com',
      documentation_url: 'https://git-scm.com/doc',
      license: 'GPL-2.0',
      requirements: 'Linux/Windows/macOS',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"git"}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 50,
      min_storage_mb: 50,
      required_ports: '[]',
    },
    {
      slug: 'composer',
      name: 'Composer',
      description: 'Dependency manager untuk PHP dengan autoloading dan version constraint.',
      category: 'Development Tools',
      icon: 'composer',
      developer: 'Composer Team',
      latest_version: '2.7.9',
      repository_url: 'https://getcomposer.org',
      official_url: 'https://getcomposer.org',
      documentation_url: 'https://getcomposer.org/doc/',
      license: 'MIT',
      requirements: 'PHP 7.2.5+, Linux/Windows',
      dependencies: '["php"]',
      installation_config: '{"type":"binary","download_url":"https://getcomposer.org/installer"}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 50,
      min_storage_mb: 50,
      required_ports: '[]',
    },
    {
      slug: 'npm',
      name: 'npm',
      description: 'Package manager default Node.js dengan registry terbesar dunia.',
      category: 'Development Tools',
      icon: 'npm',
      developer: 'npm Inc. (GitHub)',
      latest_version: '10.8.3',
      repository_url: 'https://npmjs.com',
      official_url: 'https://npmjs.com',
      documentation_url: 'https://docs.npmjs.com/',
      license: 'Artistic-2.0',
      requirements: 'Node.js terinstal',
      dependencies: '["nodejs"]',
      installation_config: '{"type":"bundled","with":"nodejs"}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 50,
      required_ports: '[]',
    },
    {
      slug: 'pnpm',
      name: 'pnpm',
      description: 'Package manager cepat dan disk-efficient dengan content-addressable storage.',
      category: 'Development Tools',
      icon: 'pnpm',
      developer: 'pnpm Team',
      latest_version: '9.9.0',
      repository_url: 'https://pnpm.io',
      official_url: 'https://pnpm.io',
      documentation_url: 'https://pnpm.io/',
      license: 'MIT',
      requirements: 'Node.js terinstal',
      dependencies: '["nodejs"]',
      installation_config: '{"type":"npm","package":"pnpm"}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 50,
      required_ports: '[]',
    },
    {
      slug: 'docker-cli',
      name: 'Docker CLI',
      description: 'Command-line interface untuk mengelola Docker containers, images, dan networks.',
      category: 'Development Tools',
      icon: 'docker',
      developer: 'Docker Inc.',
      latest_version: '27.2.0',
      repository_url: 'https://docker.com',
      official_url: 'https://docker.com',
      documentation_url: 'https://docs.docker.com/',
      license: 'Apache-2.0',
      requirements: 'Docker Engine terinstal',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"docker-ce-cli"}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 50,
      min_storage_mb: 100,
      required_ports: '[]',
    },

    // Control & Management
    {
      slug: 'phpmyadmin',
      name: 'phpMyAdmin',
      description: 'Web interface untuk administrasi MySQL/MariaDB dengan dukungan SQL, export/import.',
      category: 'Control & Management',
      icon: 'phpmyadmin',
      developer: 'phpMyAdmin Team',
      latest_version: '5.2.1',
      repository_url: 'https://phpmyadmin.net',
      official_url: 'https://phpmyadmin.net',
      documentation_url: 'https://docs.phpmyadmin.net/',
      license: 'GPL-2.0',
      requirements: 'PHP, MySQL/MariaDB, Web server (Nginx/Apache)',
      dependencies: '["php", "mysql"]',
      installation_config: '{"type":"webapp","download_url":"https://files.phpmyadmin.net/phpMyAdmin/5.2.1/phpMyAdmin-5.2.1-all-languages.zip","port":8081}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 50,
      required_ports: '[8081]',
    },
    {
      slug: 'adminer',
      name: 'Adminer',
      description: 'Database management tool single-file untuk MySQL, PostgreSQL, SQLite, MongoDB.',
      category: 'Control & Management',
      icon: 'adminer',
      developer: 'Jakub Vrána',
      latest_version: '4.8.1',
      repository_url: 'https://adminer.org',
      official_url: 'https://adminer.org',
      documentation_url: 'https://www.adminer.org/en/',
      license: 'Apache-2.0 / GPL-2.0',
      requirements: 'PHP, Database server',
      dependencies: '["php"]',
      installation_config: '{"type":"webapp","download_url":"https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1.php","port":8082}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 50,
      min_storage_mb: 5,
      required_ports: '[8082]',
    },
    {
      slug: 'redis-commander',
      name: 'Redis Commander',
      description: 'Web-based Redis management UI dengan dukungan cluster dan monitoring real-time.',
      category: 'Control & Management',
      icon: 'redis-commander',
      developer: 'Joe C. Ferry',
      latest_version: '0.8.5',
      repository_url: 'https://github.com/joeferner/redis-commander',
      official_url: 'https://github.com/joeferner/redis-commander',
      documentation_url: 'https://github.com/joeferner/redis-commander#readme',
      license: 'MIT',
      requirements: 'Node.js, Redis server',
      dependencies: '["nodejs", "redis"]',
      installation_config: '{"type":"npm","package":"redis-commander","port":8083}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 100,
      min_storage_mb: 50,
      required_ports: '[8083]',
    },
    {
      slug: 'portainer',
      name: 'Portainer',
      description: 'Docker management GUI untuk container, image, network, volume, dan stack.',
      category: 'Control & Management',
      icon: 'portainer',
      developer: 'Portainer.io',
      latest_version: '2.27.0',
      repository_url: 'https://portainer.io',
      official_url: 'https://portainer.io',
      documentation_url: 'https://docs.portainer.io/',
      license: 'Proprietary (CE: zlib)',
      requirements: 'Docker Engine, minimal 500MB RAM',
      dependencies: '[]',
      installation_config: '{"type":"docker","image":"portainer/portainer-ce:2.27.0","port":9000,"volumes":["/var/run/docker.sock:/var/run/docker.sock","portainer_data:/data"]}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 500,
      min_storage_mb: 100,
      required_ports: '[9000]',
    },

    // Security
    {
      slug: 'fail2ban',
      name: 'Fail2Ban',
      description: 'Intrusion prevention framework yang memblokir IP mencurigakan via log analysis.',
      category: 'Security',
      icon: 'fail2ban',
      developer: 'Fail2Ban Contributors',
      latest_version: '1.1.1',
      repository_url: 'https://fail2ban.org',
      official_url: 'https://fail2ban.org',
      documentation_url: 'https://www.fail2ban.org/wiki/index.php/Main_Page',
      license: 'GPL-2.0',
      requirements: 'Python, iptables/nftables, systemd',
      dependencies: '["python"]',
      installation_config: '{"type":"package_manager","package":"fail2ban","service":"fail2ban"}',
      is_featured: 1,
      os_compatibility: '["linux"]',
      min_ram_mb: 50,
      min_storage_mb: 20,
      required_ports: '[]',
    },
    {
      slug: 'clamav',
      name: 'ClamAV',
      description: 'Antivirus engine open-source untuk deteksi trojan, virus, malware, dan malicious threats.',
      category: 'Security',
      icon: 'clamav',
      developer: 'Cisco Talos',
      latest_version: '1.4.2',
      repository_url: 'https://clamav.net',
      official_url: 'https://clamav.net',
      documentation_url: 'https://docs.clamav.net/',
      license: 'GPL-2.0',
      requirements: 'Linux/Windows, minimal 1GB RAM untuk scanning',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"clamav clamav-daemon","service":"clamav-daemon"}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 1000,
      min_storage_mb: 500,
      required_ports: '[]',
    },
    {
      slug: 'ufw',
      name: 'UFW (Uncomplicated Firewall)',
      description: 'Frontend sederhana untuk iptables dengan syntax mudah dan profile aplikasi.',
      category: 'Security',
      icon: 'ufw',
      developer: 'Ubuntu/Canonical',
      latest_version: '0.36.2',
      repository_url: 'https://wiki.ubuntu.com/UncomplicatedFirewall',
      official_url: 'https://wiki.ubuntu.com/UncomplicatedFirewall',
      documentation_url: 'https://manpages.ubuntu.com/manpages/noble/en/man8/ufw.8.html',
      license: 'GPL-2.0',
      requirements: 'Linux dengan iptables/nftables',
      dependencies: '[]',
      installation_config: '{"type":"package_manager","package":"ufw"}',
      is_featured: 1,
      os_compatibility: '["linux"]',
      min_ram_mb: 10,
      min_storage_mb: 5,
      required_ports: '[]',
    },
    {
      slug: 'certbot',
      name: 'Certbot',
      description: 'ACME client otomatis untuk mendapatkan dan memperbarui sertifikat SSL/TLS Let\'s Encrypt.',
      category: 'Security',
      icon: 'certbot',
      developer: 'EFF',
      latest_version: '2.11.0',
      repository_url: 'https://certbot.eff.org',
      official_url: 'https://certbot.eff.org',
      documentation_url: 'https://eff-certbot.readthedocs.io/',
      license: 'Apache-2.0',
      requirements: 'Python, Web server (Nginx/Apache), domain valid',
      dependencies: '["python"]',
      installation_config: '{"type":"package_manager","package":"certbot python3-certbot-nginx","service":"certbot-renew.timer"}',
      is_featured: 1,
      os_compatibility: '["linux"]',
      min_ram_mb: 100,
      min_storage_mb: 50,
      required_ports: '[]',
    },

    // Monitoring
    {
      slug: 'netdata',
      name: 'Netdata',
      description: 'Real-time monitoring dengan dashboard per-second granularity untuk system dan aplikasi.',
      category: 'Monitoring',
      icon: 'netdata',
      developer: 'Netdata Inc.',
      latest_version: '1.46.0',
      repository_url: 'https://netdata.cloud',
      official_url: 'https://netdata.cloud',
      documentation_url: 'https://learn.netdata.cloud/',
      license: 'GPL-3.0',
      requirements: 'Linux, minimal 500MB RAM',
      dependencies: '[]',
      installation_config: '{"type":"docker","image":"netdata/netdata:v1.46.0","port":19999,"volumes":["/proc:/host/proc:ro","/sys:/host/sys:ro","/var/run/docker.sock:/var/run/docker.sock:ro"]}',
      is_featured: 1,
      os_compatibility: '["linux"]',
      min_ram_mb: 500,
      min_storage_mb: 500,
      required_ports: '[19999]',
    },
    {
      slug: 'prometheus',
      name: 'Prometheus',
      description: 'Monitoring dan alerting toolkit dengan data model multidimensi dan PromQL.',
      category: 'Monitoring',
      icon: 'prometheus',
      developer: 'CNCF / Prometheus Team',
      latest_version: '2.54.1',
      repository_url: 'https://prometheus.io',
      official_url: 'https://prometheus.io',
      documentation_url: 'https://prometheus.io/docs/',
      license: 'Apache-2.0',
      requirements: 'Linux/Windows, minimal 2GB RAM untuk production',
      dependencies: '[]',
      installation_config: '{"type":"binary","download_url":"https://github.com/prometheus/prometheus/releases/download/v2.54.1/prometheus-2.54.1.linux-amd64.tar.gz","port":9090}',
      is_featured: 0,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 2000,
      min_storage_mb: 5000,
      required_ports: '[9090]',
    },
    {
      slug: 'grafana',
      name: 'Grafana',
      description: 'Platform observability untuk visualisasi metrics, logs, traces dari berbagai data source.',
      category: 'Monitoring',
      icon: 'grafana',
      developer: 'Grafana Labs',
      latest_version: '11.1.4',
      repository_url: 'https://grafana.com',
      official_url: 'https://grafana.com',
      documentation_url: 'https://grafana.com/docs/',
      license: 'AGPL-3.0',
      requirements: 'Linux/Windows, database (SQLite/PostgreSQL/MySQL)',
      dependencies: '[]',
      installation_config: '{"type":"docker","image":"grafana/grafana:11.1.4","port":3000,"volumes":["grafana_data:/var/lib/grafana"]}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 500,
      min_storage_mb: 200,
      required_ports: '[3000]',
    },

    // Other Applications - WordPress (already in old catalog)
    {
      slug: 'wordpress',
      name: 'WordPress',
      description: 'Sistem manajemen konten (CMS) paling populer di dunia untuk blog, website bisnis, dan e-commerce.',
      category: 'Other Applications',
      icon: 'wordpress',
      developer: 'WordPress Foundation',
      latest_version: '6.6.1',
      repository_url: 'https://wordpress.org',
      official_url: 'https://wordpress.org',
      documentation_url: 'https://wordpress.org/documentation/',
      license: 'GPL-2.0',
      requirements: 'PHP, MySQL/MariaDB, Web server (Nginx/Apache)',
      dependencies: '["php", "mysql"]',
      installation_config: '{"type":"webapp","download_url":"https://wordpress.org/latest.tar.gz","port":80}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 256,
      min_storage_mb: 500,
      required_ports: '[80]',
    },
    {
      slug: 'ghost',
      name: 'Ghost',
      description: 'Platform publikasi modern untuk blogger dan penerbit profesional. Cepat, bersih, dan fokus pada konten.',
      category: 'Other Applications',
      icon: 'ghost',
      developer: 'Ghost Foundation',
      latest_version: '5.102.0',
      repository_url: 'https://ghost.org',
      official_url: 'https://ghost.org',
      documentation_url: 'https://ghost.org/docs/',
      license: 'MIT',
      requirements: 'Node.js, MySQL, Web server (Nginx/Apache)',
      dependencies: '["nodejs", "mysql"]',
      installation_config: '{"type":"npm","package":"ghost-cli@latest","port":2368}',
      is_featured: 1,
      os_compatibility: '["linux"]',
      min_ram_mb: 500,
      min_storage_mb: 1000,
      required_ports: '[2368]',
    },
    {
      slug: 'nextcloud',
      name: 'Nextcloud',
      description: 'Platform kolaborasi self-hosted untuk file sharing, kalender, kontak, dan office online.',
      category: 'Other Applications',
      icon: 'nextcloud',
      developer: 'Nextcloud GmbH',
      latest_version: '30.0.1',
      repository_url: 'https://nextcloud.com',
      official_url: 'https://nextcloud.com',
      documentation_url: 'https://docs.nextcloud.com/',
      license: 'AGPL-3.0',
      requirements: 'PHP, MySQL/PostgreSQL, Web server (Nginx/Apache), Redis (recommended)',
      dependencies: '["php", "mysql", "redis"]',
      installation_config: '{"type":"webapp","download_url":"https://download.nextcloud.com/server/releases/latest.tar.bz2","port":80}',
      is_featured: 1,
      os_compatibility: '["linux"]',
      min_ram_mb: 1000,
      min_storage_mb: 2000,
      required_ports: '[80]',
    },
    {
      slug: 'gitea',
      name: 'Gitea',
      description: 'Layanan Git self-hosted yang ringan dan cepat, alternatif GitLab/GitHub Enterprise.',
      category: 'Other Applications',
      icon: 'gitea',
      developer: 'Gitea Contributors',
      latest_version: '1.22.1',
      repository_url: 'https://gitea.io',
      official_url: 'https://gitea.io',
      documentation_url: 'https://docs.gitea.io/',
      license: 'MIT',
      requirements: 'Linux/Windows, Database (MySQL/PostgreSQL/SQLite), minimal 256MB RAM',
      dependencies: '[]',
      installation_config: '{"type":"binary","download_url":"https://dl.gitea.io/gitea/1.22.1/gitea-1.22.1-linux-amd64","port":3000,"service":"gitea"}',
      is_featured: 1,
      os_compatibility: '["linux","windows"]',
      min_ram_mb: 256,
      min_storage_mb: 200,
      required_ports: '[3000]',
    },
  ];

  const insertStoreApp = db.prepare(`
    INSERT OR IGNORE INTO store_applications
    (slug, name, description, category, icon, developer, latest_version, repository_url, official_url, documentation_url, license, requirements, dependencies, installation_config, is_featured, os_compatibility, min_ram_mb, min_storage_mb, required_ports)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const app of storeApps) {
    insertStoreApp.run(
      app.slug,
      app.name,
      app.description,
      app.category,
      app.icon,
      app.developer,
      app.latest_version,
      app.repository_url,
      app.official_url,
      app.documentation_url,
      app.license,
      app.requirements,
      app.dependencies,
      app.installation_config,
      app.is_featured,
      app.os_compatibility,
      app.min_ram_mb,
      app.min_storage_mb,
      app.required_ports
    );
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
