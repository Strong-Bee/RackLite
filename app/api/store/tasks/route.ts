import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const applicationId = searchParams.get('applicationId');
    const limit = parseInt(searchParams.get('limit') || '20');

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (applicationId) {
      whereClause += ' AND application_id = ?';
      params.push(parseInt(applicationId));
    }

    const tasks = db.prepare(`
      SELECT it.*, sa.name as app_name, sa.slug as app_slug
      FROM installation_tasks it
      LEFT JOIN store_applications sa ON it.application_id = sa.id
      ${whereClause}
      ORDER BY it.started_at DESC
      LIMIT ?
    `).all(...params, limit) as Array<{
      id: string;
      application_id: number;
      action: string;
      status: string;
      progress: number;
      logs: string | null;
      error_message: string | null;
      started_at: string;
      completed_at: string | null;
      app_name: string | null;
      app_slug: string | null;
    }>;

    return NextResponse.json({ tasks });
  } catch (err) {
    console.error('Failed to load tasks:', err);
    return NextResponse.json({ error: 'Gagal memuat tugas' }, { status: 500 });
  }
}