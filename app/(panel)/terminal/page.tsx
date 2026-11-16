import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth';
import { TerminalClient } from '@/components/terminal/TerminalClient';

export default async function TerminalPage() {
  const session = await getServerSession();
  if (!session || session.role !== 'admin') {
    redirect('/dashboard');
  }
  return <TerminalClient />;
}
