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

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const featured = searchParams.get('featured');
    const sort = searchParams.get('sort') || 'name';
    const order = searchParams.get('order') || 'asc';
    const installedOnly = searchParams.get('installed') === 'true';
    const notInstalled = searchParams.get('notInstalled') === 'true';

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (category && category !== 'all') {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      whereClause += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (featured === 'true') {
      whereClause += ' AND is_featured = 1';
    }

    if (installedOnly || notInstalled) {
      const installedSubquery = 'SELECT application_id FROM installed_applications';
      if (installedOnly) {
        whereClause += ` AND id IN (${installedSubquery})`;
      } else {
        whereClause += ` AND id NOT IN (${installedSubquery})`;
      }
    }

    const validSortColumns = ['name', 'category', 'latest_version', 'created_at', 'updated_at'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'name';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const offset = (page - 1) * limit;

    const totalQuery = `SELECT COUNT(*) as total FROM store_applications ${whereClause}`;
    const totalResult = db.prepare(totalQuery).get(...params) as { total: number };

    const dataQuery = `
      SELECT * FROM store_applications
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const apps = db.prepare(dataQuery).all(...params, limit, offset) as Array<{
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

    return NextResponse.json({
      apps: formattedApps,
      pagination: {
        page,
        limit,
        total: totalResult.total,
        totalPages: Math.ceil(totalResult.total / limit),
      },
    });
  } catch (err) {
    console.error('Failed to load store apps:', err);
    return NextResponse.json({ error: 'Gagal memuat aplikasi store' }, { status: 500 });
  }
}