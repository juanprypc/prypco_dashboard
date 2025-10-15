import { NextResponse } from 'next/server';
import { fetchAdminAnalytics } from '@/lib/adminAnalytics';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const monthsParam = Number(url.searchParams.get('months') ?? 12);
    const months = Number.isFinite(monthsParam) && monthsParam > 0 ? Math.min(Math.floor(monthsParam), 36) : 12;

    const pointsPerAed = Number(process.env.POINTS_PER_AED ?? 2);
    const analytics = await fetchAdminAnalytics(pointsPerAed, months);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      pointsPerAed,
      ...analytics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load analytics';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
