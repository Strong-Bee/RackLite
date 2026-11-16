import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT ia.*, sa.slug, sa.name, sa.category, sa.icon, sa.developer, sa.latest_version, sa.repository_url, sa.official_url, sa.documentation_url
      FROM installed_applications ia
      JOIN store_applications sa ON ia.application_id = sa.id
      WHERE ia.installed_version != sa.latest_version
      ORDER BY ia.installed_at DESC
    `).all() as Array<{
      id: string;
      application_id: number;
      installed_version: string;
      installation_path: string;
      service_name: string | null;
      port: number | null;
      status: string;
      installed_at: string;
      updated_at: string | null;
      slug: string;
      name: string;
      category: string;
      icon: string | null;
      developer: string | null;
      latest_version: string;
      repository_url: string | null;
      official_url: string | null;
      documentation_url: string | null;
    }>;

    const apps = rows.map(row => ({
      id: row.id,
      appId: row.slug,
      name: row.name,
      version: row.installed_version,
      latestVersion: row.latest_version,
      category: row.category,
      icon: row.icon,
      developer: row.developer,
      status: row.status,
      installationPath: row.installation_path,
      serviceName: row.service_name,
      port: row.port,
      installedAt: row.installed_at,
      updatedAt: row.updated_at,
      documentationUrl: row.documentation_url,
    }));

    return NextResponse.json({ apps });
  } catch (err) {
    console.error('Failed to load updates:', err);
    return NextResponse.json({ apps: [] });
  }
}