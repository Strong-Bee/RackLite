import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';
import { runSystemCommand } from '@/lib/system/exec';

export async function GET(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const db = getDb();

    // Check system requirements
    const checks: Record<string, { ok: boolean; message: string }> = {};

    // Disk space
    const diskResult = await runSystemCommand('df', ['-h', '/']);
    checks.disk = {
      ok: diskResult.ok,
      message: diskResult.ok ? diskResult.stdout.trim() : diskResult.stderr,
    };

    // Memory
    const memResult = await runSystemCommand('free', ['-h']);
    checks.memory = {
      ok: memResult.ok,
      message: memResult.ok ? memResult.stdout.trim() : memResult.stderr,
    };

    // Docker
    const dockerResult = await runSystemCommand('docker', ['version', '--format', '{{.Server.Version}}']);
    checks.docker = {
      ok: dockerResult.ok,
      message: dockerResult.ok ? `Docker ${dockerResult.stdout.trim()}` : 'Docker not available',
    };

    // Database
    const dbCount = db.prepare('SELECT COUNT(*) as total FROM store_applications').get() as { total: number };
    checks.catalog = {
      ok: true,
      message: `${dbCount.total} applications in catalog`,
    };

    const installedCount = db.prepare('SELECT COUNT(*) as total FROM installed_applications').get() as { total: number };
    checks.installed = {
      ok: true,
      message: `${installedCount.total} applications installed`,
    };

    // Nginx
    const nginxResult = await runSystemCommand('nginx', ['-v']);
    checks.nginx = {
      ok: nginxResult.ok,
      message: nginxResult.ok ? nginxResult.stderr.trim() : 'Nginx not available',
    };

    const allOk = Object.values(checks).every(c => c.ok);

    return NextResponse.json({
      healthy: allOk,
      checks,
    });
  } catch (err) {
    console.error('Health check failed:', err);
    return NextResponse.json({ healthy: false, error: 'Health check failed' }, { status: 500 });
  }
}