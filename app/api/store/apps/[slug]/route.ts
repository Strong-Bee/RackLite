import { NextResponse } from 'next/server';
import { withAuth, type AuthenticatedRequest } from '@/lib/api-guard';
import { getDb } from '@/lib/db';

export async function GET(
  req: AuthenticatedRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const { slug } = await params;
    const db = getDb();

    const app = db.prepare('SELECT * FROM store_applications WHERE slug = ?').get(slug) as
      | {
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
        }
      | undefined;

    if (!app) {
      return NextResponse.json({ error: 'Aplikasi tidak ditemukan' }, { status: 404 });
    }

    // Check if installed
    const installed = db.prepare('SELECT * FROM installed_applications WHERE application_id = ?').get(app.id) as
      | {
          id: string;
          application_id: number;
          installed_version: string;
          installation_path: string;
          service_name: string | null;
          port: number | null;
          status: string;
          installed_at: string;
          updated_at: string | null;
        }
      | undefined;

    // Get versions
    const versions = db.prepare('SELECT * FROM application_versions WHERE application_id = ? ORDER BY created_at DESC').all(app.id) as Array<{
      id: number;
      application_id: number;
      version: string;
      release_notes: string | null;
      release_date: string | null;
      download_url: string | null;
      checksum: string | null;
      created_at: string;
    }>;

    const formattedApp = {
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
      installed: installed
        ? {
            id: installed.id,
            installedVersion: installed.installed_version,
            installationPath: installed.installation_path,
            serviceName: installed.service_name,
            port: installed.port,
            status: installed.status,
            installedAt: installed.installed_at,
            updatedAt: installed.updated_at,
          }
        : null,
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        releaseNotes: v.release_notes,
        releaseDate: v.release_date,
        downloadUrl: v.download_url,
        checksum: v.checksum,
        createdAt: v.created_at,
      })),
    };

    return NextResponse.json({ app: formattedApp });
  } catch (err) {
    console.error('Failed to load app detail:', err);
    return NextResponse.json({ error: 'Gagal memuat detail aplikasi' }, { status: 500 });
  }
}