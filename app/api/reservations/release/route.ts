import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type ReleaseReservationRequest = {
  unitAllocationId: string;
  agentId: string;
};

/**
 * Release a reservation lock on a unit allocation
 * Called when user cancels or navigates away before completing redemption
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReleaseReservationRequest;
    const { unitAllocationId, agentId } = body;

    if (!unitAllocationId) {
      return NextResponse.json(
        { error: 'Missing unitAllocationId' },
        { status: 400 }
      );
    }

    if (!agentId) {
      return NextResponse.json(
        { error: 'Missing agentId' },
        { status: 400 }
      );
    }

    // Call Supabase function to release reservation
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc('release_reservation' as never, {
      p_unit_id: unitAllocationId,
      p_agent_id: agentId,
    } as never);

    if (error) {
      console.error('Reservation release error:', error);
      return NextResponse.json(
        { error: 'Failed to release reservation', details: error.message },
        { status: 500 }
      );
    }

    // The function returns true if a reservation was released, null if not found
    const released = data === true;

    return NextResponse.json({
      success: true,
      released,
      message: released
        ? 'Reservation released successfully'
        : 'No active reservation found for this agent',
    });
  } catch (error) {
    console.error('Release reservation API error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
