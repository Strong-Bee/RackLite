import { collectSystemMetrics } from '@/lib/system/metrics';
import { DashboardClient } from '@/components/dashboard/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const initialMetrics = await collectSystemMetrics();
  return <DashboardClient initialMetrics={initialMetrics} />;
}
