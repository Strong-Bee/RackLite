import { SecurityClient } from '@/components/security/SecurityClient';
import { PanelShell } from '@/components/layout/PanelShell';
import { getServerSession } from '@/lib/auth';

export default async function SecurityPage() {
  const session = await getServerSession();

  if (!session) {
    return <div>Loading...</div>;
  }

  return (
    <PanelShell username={session.username} role={session.role}>
      <SecurityClient />
    </PanelShell>
  );
}