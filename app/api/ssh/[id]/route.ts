import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { recordAudit, requireAuth } from '@/lib/api-guard';

const SshKeyUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Nama kunci wajib diisi').max(100).optional(),
  publicKey: z.string().trim().min(1, 'Public key wajib diisi').optional(),
  privateKey: z.string().trim().max(10000).optional(),
  passphrase: z.string().trim().max(255).optional(),
});

function computeFingerprint(publicKey: string): string {
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsed = SshKeyUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Data kunci tidak valid.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM ssh_keys WHERE id = ?').get(id) as
    | { id: string; name: string; fingerprint: string; type: string; public_key: string; private_key: string | null; passphrase: string | null; created_at: string }
    | undefined;

  if (!existing) {
    return NextResponse.json({ error: 'Kunci tidak ditemukan.' }, { status: 404 });
  }

  const { name, publicKey, privateKey, passphrase } = parsed.data;
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (publicKey !== undefined) {
    updates.push('public_key = ?');
    values.push(publicKey);
    updates.push('fingerprint = ?');
    values.push(computeFingerprint(publicKey));
    updates.push('type = ?');
    values.push(getKeyType(publicKey));
  }
  if (privateKey !== undefined) {
    updates.push('private_key = ?');
    values.push(privateKey || null);
  }
  if (passphrase !== undefined) {
    updates.push('passphrase = ?');
    values.push(passphrase || null);
  }

  if (updates.length === 0) {
    return NextResponse.json({ ok: true, message: 'Tidak ada perubahan.' });
  }

  values.push(id);
  db.prepare(`UPDATE ssh_keys SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'SSH_KEY_UPDATE',
    target: `ssh_key:${id}`,
    status: 'success',
    detail: `updated fields: ${Object.keys(parsed.data).join(', ')}`,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: 'Kunci SSH berhasil diperbarui.' });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAuth(req, { requiredRole: 'admin' });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const db = getDb();
  const existing = db.prepare('SELECT name FROM ssh_keys WHERE id = ?').get(id) as { name: string } | undefined;

  if (!existing) {
    return NextResponse.json({ error: 'Kunci tidak ditemukan.' }, { status: 404 });
  }

  db.prepare('DELETE FROM ssh_keys WHERE id = ?').run(id);

  recordAudit({
    userId: guard.session.userId,
    username: guard.session.username,
    action: 'SSH_KEY_DELETE',
    target: `ssh_key:${id}`,
    status: 'success',
    detail: `name=${existing.name}`,
    ip: guard.ip,
  });

  return NextResponse.json({ ok: true, message: 'Kunci SSH berhasil dihapus.' });
}