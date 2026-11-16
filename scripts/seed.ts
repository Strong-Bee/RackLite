import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.PANEL_DATA_DIR || './data');
const DB_PATH = path.join(DATA_DIR, 'panel.db');

const targetUsername = (process.env.PANEL_ADMIN_USER || 'admin').toLowerCase();
const newPassword =
  process.argv[2] || process.env.PANEL_ADMIN_PASS || 'admin12345';

if (newPassword.length < 8) {
  console.error('Error: Kata sandi minimal 8 karakter.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Pastikan tabel users tersedia jika script dijalankan sebelum boot pertama
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
`);

const passwordHash = bcrypt.hashSync(newPassword, 10);

const existing = db
  .prepare('SELECT id FROM users WHERE username = ?')
  .get(targetUsername) as { id: number } | undefined;

if (existing) {
  // Force-reset password, aktifkan akun admin, dan reset 2FA agar bisa masuk kembali
  db.prepare(
    `UPDATE users
     SET password_hash = ?, role = 'admin', is_active = 1, totp_enabled = 0, totp_secret = NULL
     WHERE id = ?`
  ).run(passwordHash, existing.id);
  console.log(
    `Berhasil mereset kata sandi untuk user "${targetUsername}" (id=${existing.id}) di ${DB_PATH}.`
  );
} else {
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES (?, ?, 'admin', 1)`
    )
    .run(targetUsername, passwordHash);
  console.log(
    `User "${targetUsername}" belum ada; akun baru dibuat (id=${info.lastInsertRowid}) di ${DB_PATH}.`
  );
}

// Catat ke audit_logs jika tabel sudah tersedia
const auditTable = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
  )
  .get();
if (auditTable) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, username, action, target, status, detail, ip_address)
     VALUES (?, ?, 'CLI_PASSWORD_RESET', ?, 'success', 'Reset paksa via scripts/seed.ts', '127.0.0.1')`
  ).run(existing?.id ?? null, targetUsername, targetUsername);
}

db.close();
