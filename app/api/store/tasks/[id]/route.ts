import { NextResponse } from 'next/server';
import { withAuth, type AuthenticatedRequest } from '@/lib/api-guard';
import { getDb } from '@/lib/db';

export async function GET(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const { id } = await params;
    const db = getDb();

    const task = db.prepare(`
      SELECT it.*, sa.name as app_name, sa.slug as app_slug
      FROM installation_tasks it
      LEFT JOIN store_applications sa ON it.application_id = sa.id
      WHERE it.id = ?
    `).get(id) as
      | {
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
        }
      | undefined;

    if (!task) {
      return NextResponse.json({ error: 'Tugas tidak ditemukan' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (err) {
    console.error('Failed to load task:', err);
    return NextResponse.json({ error: 'Gagal memuat tugas' }, { status: 500 });
  }
}