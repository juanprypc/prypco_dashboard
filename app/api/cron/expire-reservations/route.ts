import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

/**
 * Cron job to expire old reservations
 * Should be called every minute via Vercel Cron
 *
 * Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/expire-reservations",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Call Supabase function to expire reservations
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc('expire_reservations' as never);

    if (error) {
      console.error('Expire reservations error:', error);
      return NextResponse.json(
        { error: 'Failed to expire reservations', details: error.message },
        { status: 500 }
      );
    }

    // The function returns the count of expired reservations
    const expiredCount = (data as { expired_count: number }[] | null)?.[0]?.expired_count ?? 0;

    console.log(`Expired ${expiredCount} reservation(s) at ${new Date().toISOString()}`);

    return NextResponse.json({
      success: true,
      expiredCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
