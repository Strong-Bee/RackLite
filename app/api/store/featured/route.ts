import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const db = getDb();
    const apps = db.prepare(`
      SELECT * FROM store_applications
      WHERE is_featured = 1
      ORDER BY name
      LIMIT 10
    `).all() as Array<{
      id: number;
      slug: string;
      name: string;
      description: string;
      category: string;
      icon: string | null;
      developer: string | null;
      latest_version: string;
      repository_url: string | null;
      official_url: string | null;
      documentation_url: string | null;
      license: string | null;
      requirements: string | null;
      dependencies: string | null;
      installation_config: string | null;
      is_featured: number;
      os_compatibility: string | null;
      min_ram_mb: number | null;
      min_storage_mb: number | null;
      required_ports: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const formattedApps = apps.map(app => ({
      id: String(app.id),
      slug: app.slug,
      name: app.name,
      description: app.description,
      category: app.category,
      icon: app.icon,
      developer: app.developer,
      latestVersion: app.latest_version,
      repository: app.repository_url,
      maintainer: app.developer,
      homepage: app.official_url,
      documentationUrl: app.documentation_url,
      license: app.license,
      requirements: app.requirements,
      dependencies: app.dependencies ? JSON.parse(app.dependencies) : [],
      installationConfig: app.installation_config ? JSON.parse(app.installation_config) : null,
      isFeatured: app.is_featured === 1,
      osCompatibility: app.os_compatibility ? JSON.parse(app.os_compatibility) : [],
      minRamMb: app.min_ram_mb,
      minStorageMb: app.min_storage_mb,
      requiredPorts: app.required_ports ? JSON.parse(app.required_ports) : [],
      createdAt: app.created_at,
      updatedAt: app.updated_at,
    }));

    return NextResponse.json({ apps: formattedApps });
  } catch (err) {
    console.error('Failed to load featured apps:', err);
    return NextResponse.json({ apps: [] });
  }
}