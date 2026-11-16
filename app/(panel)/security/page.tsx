import { SecurityClient } from '@/components/security/SecurityClient';
import { getServerSession } from '@/lib/auth';

export default async function SecurityPage() {
  const session = await getServerSession();

  if (!session) {
    return <div>Loading...</div>;
  }

  return <SecurityClient />;
}