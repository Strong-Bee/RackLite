import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { PanelShell } from '@/components/layout/PanelShell';
import type { UserRole } from '@/types/panel';

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }

  const db = getDb();
  const user = db
    .prepare('SELECT id, username, role, is_active FROM users WHERE id = ?')
    .get(session.userId) as
    | { id: number; username: string; role: UserRole; is_active: number }
    | undefined;

  if (!user || user.is_active !== 1) {
    redirect('/login');
  }

  return (
    <PanelShell username={user.username} role={user.role}>
      {children}
    </PanelShell>
  );
}
