import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { UsersClient } from '@/components/users/UsersClient';

export default async function UsersPage() {
  const session = await getServerSession();
  if (!session) redirect('/login');
  return <UsersClient currentRole={session.role} />;
}
