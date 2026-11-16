import path from 'node:path';
import { getDataDir } from '@/lib/db';
import { findBinary, runSystemCommand } from '@/lib/system/exec';
import { DB_NAME_REGEX } from '@/lib/security';

export interface DbActionResult {
  ok: boolean;
  executedOnEngine: boolean;
  message: string;
}

const VALID_PRIVILEGES = new Set([
  'ALL PRIVILEGES',
  'SELECT, INSERT, UPDATE, DELETE',
  'SELECT',
]);

function escapeSqlStringLiteral(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function createDatabaseAndUser(params: {
  engine: 'mariadb' | 'postgres';
  dbName: string;
  dbUser: string;
  password: string;
  privilege: string;
}): Promise<DbActionResult> {
  if (!DB_NAME_REGEX.test(params.dbName) || !DB_NAME_REGEX.test(params.dbUser)) {
    return {
      ok: false,
      executedOnEngine: false,
      message: 'Nama database/user hanya boleh huruf, angka, dan garis bawah.',
    };
  }

  const priv = VALID_PRIVILEGES.has(params.privilege)
    ? params.privilege
    : 'ALL PRIVILEGES';

  if (params.engine === 'mariadb') {
    const bin = await findBinary('mysql');
    if (!bin) {
      return {
        ok: true,
        executedOnEngine: false,
        message:
          'Biner mysql/mariadb tidak terpasang di host ini; konfigurasi dicatat di panel.',
      };
    }

    const safePass = escapeSqlStringLiteral(params.password);
    const sql = [
      `CREATE DATABASE IF NOT EXISTS \`${params.dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      `CREATE USER IF NOT EXISTS '${params.dbUser}'@'localhost' IDENTIFIED BY '${safePass}';`,
      `GRANT ${priv} ON \`${params.dbName}\`.* TO '${params.dbUser}'@'localhost';`,
      `FLUSH PRIVILEGES;`,
    ].join(' ');

    const res = await runSystemCommand('mysql', ['-e', sql]);
    if (!res.ok) {
      return {
        ok: false,
        executedOnEngine: false,
        message: `MariaDB error: ${res.stderr}`,
      };
    }
    return {
      ok: true,
      executedOnEngine: true,
      message: `Database MariaDB "${params.dbName}" & user "${params.dbUser}" berhasil dibuat.`,
    };
  }

  // PostgreSQL
  const psqlBin = await findBinary('psql');
  if (!psqlBin) {
    return {
      ok: true,
      executedOnEngine: false,
      message:
        'Biner psql/PostgreSQL tidak terpasang di host ini; konfigurasi dicatat di panel.',
    };
  }

  const safePgPass = params.password.replace(/'/g, "''");
  const createUserSql = `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${params.dbUser}') THEN CREATE USER "${params.dbUser}" WITH PASSWORD '${safePgPass}'; END IF; END $$;`;
  await runSystemCommand('psql', ['-U', 'postgres', '-c', createUserSql]);

  const createDbRes = await runSystemCommand('psql', [
    '-U',
    'postgres',
    '-c',
    `CREATE DATABASE "${params.dbName}" OWNER "${params.dbUser}";`,
  ]);
  if (!createDbRes.ok) {
    return {
      ok: false,
      executedOnEngine: false,
      message: `PostgreSQL error: ${createDbRes.stderr}`,
    };
  }

  return {
    ok: true,
    executedOnEngine: true,
    message: `Database PostgreSQL "${params.dbName}" & role "${params.dbUser}" berhasil dibuat.`,
  };
}

export async function dropDatabaseAndUser(
  engine: 'mariadb' | 'postgres',
  dbName: string,
  dbUser: string
): Promise<DbActionResult> {
  if (!DB_NAME_REGEX.test(dbName) || !DB_NAME_REGEX.test(dbUser)) {
    return {
      ok: false,
      executedOnEngine: false,
      message: 'Identifier database tidak valid.',
    };
  }

  if (engine === 'mariadb') {
    const bin = await findBinary('mysql');
    if (!bin) {
      return {
        ok: true,
        executedOnEngine: false,
        message: 'Catatan database dihapus dari panel (biner mysql tidak terpasang).',
      };
    }
    const sql = `DROP DATABASE IF EXISTS \`${dbName}\`; DROP USER IF EXISTS '${dbUser}'@'localhost'; FLUSH PRIVILEGES;`;
    const res = await runSystemCommand('mysql', ['-e', sql]);
    return {
      ok: res.ok,
      executedOnEngine: res.ok,
      message: res.ok
        ? `Database MariaDB "${dbName}" dihapus.`
        : `MariaDB error: ${res.stderr}`,
    };
  }

  const psqlBin = await findBinary('psql');
  if (!psqlBin) {
    return {
      ok: true,
      executedOnEngine: false,
      message: 'Catatan database dihapus dari panel (biner psql tidak terpasang).',
    };
  }
  const res = await runSystemCommand('psql', [
    '-U',
    'postgres',
    '-c',
    `DROP DATABASE IF EXISTS "${dbName}";`,
  ]);
  return {
    ok: res.ok,
    executedOnEngine: res.ok,
    message: res.ok
      ? `Database PostgreSQL "${dbName}" dihapus.`
      : `PostgreSQL error: ${res.stderr}`,
  };
}

export async function dumpDatabase(
  engine: 'mariadb' | 'postgres',
  dbName: string
): Promise<{ ok: boolean; filePath?: string; message: string }> {
  if (!DB_NAME_REGEX.test(dbName)) {
    return { ok: false, message: 'Nama database tidak valid.' };
  }
  const backupsDir = path.join(getDataDir(), 'backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupsDir, `${engine}-${dbName}-${stamp}.sql`);

  if (engine === 'mariadb') {
    const bin = await findBinary('mysqldump');
    if (!bin) {
      return {
        ok: false,
        message: 'Biner mysqldump tidak terpasang di host.',
      };
    }
    const res = await runSystemCommand('mysqldump', [
      '--single-transaction',
      `--result-file=${filePath}`,
      dbName,
    ]);
    return res.ok
      ? { ok: true, filePath, message: `Dump tersimpan di ${filePath}` }
      : { ok: false, message: res.stderr };
  }

  const bin = await findBinary('pg_dump');
  if (!bin) {
    return { ok: false, message: 'Biner pg_dump tidak terpasang di host.' };
  }
  const res = await runSystemCommand('pg_dump', [
    '-U',
    'postgres',
    '-f',
    filePath,
    dbName,
  ]);
  return res.ok
    ? { ok: true, filePath, message: `Dump tersimpan di ${filePath}` }
    : { ok: false, message: res.stderr };
}
