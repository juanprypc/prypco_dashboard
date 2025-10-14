import { NextResponse } from 'next/server';
import { getAdminAnalytics } from '@/lib/adminAnalytics';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const months = Number(url.searchParams.get('months') ?? 12);
    const pointsPerAed = Number(process.env.POINTS_PER_AED ?? 2);

    const data = await getAdminAnalytics(pointsPerAed, Number.isFinite(months) && months > 0 ? Math.min(months, 36) : 12);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      pointsPerAed,
      ...data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load analytics';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
