import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const db = getDb();

    const categories = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM store_applications
      GROUP BY category
      ORDER BY category
    `).all() as Array<{ category: string; count: number }>;

    return NextResponse.json({ categories });
  } catch (err) {
    console.error('Failed to load categories:', err);
    return NextResponse.json({ error: 'Gagal memuat kategori' }, { status: 500 });
  }
}