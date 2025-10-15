import { fetchAdminAnalytics } from '@/lib/adminAnalytics';
import { AdminAnalyticsDashboard } from '@/components/AdminAnalyticsDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const pointsPerAed = Number(process.env.POINTS_PER_AED ?? 2);
  const data = await fetchAdminAnalytics(pointsPerAed, 12);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
      <AdminAnalyticsDashboard data={data} generatedAt={new Date().toISOString()} pointsPerAed={pointsPerAed} />
    </div>
  );
}
