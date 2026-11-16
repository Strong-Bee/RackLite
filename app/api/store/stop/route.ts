import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api-guard';
import { getDb } from '@/lib/db';
import { recordAudit } from '@/lib/api-guard';
import { runSystemCommand } from '@/lib/system/exec';

export async function POST(req: NextRequest) {
  const authResult = await withAuth(req, { requiredRole: 'admin' });
  if (authResult) return authResult;

  try {
    const body = await req.json() as { installedId: string };
    const { installedId } = body;

    if (!installedId) {
      return NextResponse.json({ error: 'ID instalasi diperlukan' }, { status: 400 });
    }

    const db = getDb();
    const installed = db.prepare('SELECT * FROM installed_applications WHERE id = ?').get(installedId) as
      | {
          id: string;
          application_id: number;
          service_name: string | null;
          status: string;
        }
      | undefined;

    if (!installed) {
      return NextResponse.json({ error: 'Aplikasi tidak ditemukan' }, { status: 404 });
    }

    if (!installed.service_name) {
      return NextResponse.json({ error: 'Aplikasi tidak memiliki service yang dapat dikelola' }, { status: 400 });
    }

    if (installed.status === 'stopped') {
      return NextResponse.json({ error: 'Service sudah dihentikan' }, { status: 400 });
    }

    const app = db.prepare('SELECT name FROM store_applications WHERE id = ?').get(installed.application_id) as { name: string } | undefined;

    const result = await runSystemCommand('systemctl', ['stop', installed.service_name]);
    if (!result.ok) {
      return NextResponse.json({ error: `Gagal menghentikan service: ${result.stderr}` }, { status: 500 });
    }

    db.prepare('UPDATE installed_applications SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run('stopped', installedId);

    const user = (req as any).user;
    await recordAudit({
      userId: user.id,
      username: user.username,
      action: 'APP_STOP',
      target: `/api/store/stop`,
      status: 'success',
      detail: `Stopped ${app?.name || installedId}`,
      ip: (req as any).ip,
    });

    return NextResponse.json({ message: 'Service berhasil dihentikan' });
  } catch (err) {
    console.error('Stop failed:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal menghentikan service' }, { status: 500 });
  }
}