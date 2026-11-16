import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { recordAudit, requireAuth } from '@/lib/api-guard';

const SshKeySchema = z.object({
  name: z.string().trim().min(1, 'Nama kunci wajib diisi').max(100),
  publicKey: z.string().trim().min(1, 'Public key wajib diisi'),
  privateKey: z.string().trim().max(10000).optional().default(''),
  passphrase: z.string().trim().max(255).optional().default(''),
});

function computeFingerprint(publicKey: string): string {
  // Simple fingerprint: SHA256 of public key base64 part
  const crypto = require('node:crypto');
  const parts = publicKey.trim().split(/\s+/);
  if (parts.length >= 2) {
    return crypto.createHash('sha256').update(parts[1]).digest('hex').match(/.{2}/g)?.join(':') || '';
  }
  return crypto.createHash('sha256').update(publicKey).digest('hex').match(/.{2}/g)?.join(':') || '';
}

function getKeyType(publicKey: string): string {
  const parts = publicKey.trim().split(/\s+/);
  if (parts.length >= 1) {
    return parts[0].replace(/^(ssh-|ecdsa-)/, '');
  }
  return 'unknown';
}

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const keys = db.prepare('SELECT * FROM ssh_keys ORDER BY created_at DESC').all() as Array<{
    id: string;
    name: string;
    fingerprint: string;
    type: string;
    public_key: string;
    private_key: string | null;
    passphrase: string | null;
    created_at: string;
  }>;

  // Don't send private keys or passphrases to client
  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      fingerprint: k.fingerprint,
      type: k.type,
      publicKey: k.public_key,
      privateKey: k.private_key ? '[REDACTED]' : null,
      createdAt: k.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const parsed = SshKeySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Data kunci tidak valid.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const { name, publicKey, privateKey, passphrase } = parsed.data;
  const fingerprint = computeFingerprint(publicKey);
  const type = getKeyType(publicKey);
  const id = crypto.randomUUID();

  const insert = db.prepare(
    `INSERT INTO ssh_keys (id, name, fingerprint, type, public_key, private_key, passphrase, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  insert.run(id, name, fingerprint, type, publicKey, privateKey || null, passphrase || null);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'SSH_KEY_CREATE',
    target: `ssh_key:${id}`,
    status: 'success',
    detail: `name=${name}, type=${type}`,
    ip: guard.ip,
  });

  return NextResponse.json({
    ok: true,
    message: 'Kunci SSH berhasil ditambahkan.',
    key: { id, name, fingerprint, type, publicKey, createdAt: new Date().toISOString() },
  });
}