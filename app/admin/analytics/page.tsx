import { Suspense } from 'react';
import { AdminAnalyticsDashboard } from '@/components/AdminAnalyticsDashboard';
import { getAdminAnalytics } from '@/lib/adminAnalytics';

export const dynamic = 'force-dynamic';

async function AnalyticsContent() {
  const pointsPerAed = Number(process.env.POINTS_PER_AED ?? 2);
  const data = await getAdminAnalytics(pointsPerAed, 12);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
      <AdminAnalyticsDashboard data={data} generatedAt={new Date().toISOString()} pointsPerAed={pointsPerAed} />
    </div>
  );
}

export default function AdminAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1280px] px-4 py-10 text-sm text-[var(--color-outer-space)]/60 sm:px-6 lg:px-10">
          Loading analytics…
        </div>
      }
    >
      <AnalyticsContent />
    </Suspense>
  );
}
