import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const db = getDb();

    const totalAvailable = db.prepare('SELECT COUNT(*) as total FROM store_applications').get() as { total: number };
    const totalInstalled = db.prepare('SELECT COUNT(*) as total FROM installed_applications').get() as { total: number };
    const totalUpdates = db.prepare(`
      SELECT COUNT(*) as total FROM installed_applications ia
      JOIN store_applications sa ON ia.application_id = sa.id
      WHERE ia.installed_version != sa.latest_version
    `).get() as { total: number };
    const totalCategories = db.prepare('SELECT COUNT(DISTINCT category) as total FROM store_applications').get() as { total: number };

    return NextResponse.json({
      totalAvailable: totalAvailable.total,
      totalInstalled: totalInstalled.total,
      totalUpdates: totalUpdates.total,
      totalCategories: totalCategories.total,
    });
  } catch (err) {
    console.error('Failed to load stats:', err);
    return NextResponse.json({
      totalAvailable: 0,
      totalInstalled: 0,
      totalUpdates: 0,
      totalCategories: 0,
    });
  }
}