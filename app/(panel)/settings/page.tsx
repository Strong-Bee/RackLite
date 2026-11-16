import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { SettingsClient } from '@/components/settings/SettingsClient';

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session) redirect('/login');
  return <SettingsClient currentRole={session.role} />;
}
