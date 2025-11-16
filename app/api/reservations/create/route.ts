import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

type CreateReservationRequest = {
  unitAllocationId: string;
  agentId: string;
  lerCode: string;
  durationMinutes?: number;
};

/**
 * Create a reservation lock on a unit allocation
 * This prevents other agents from booking the same unit for 5 minutes
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateReservationRequest;
    const { unitAllocationId, agentId, lerCode, durationMinutes = 5 } = body;

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

    if (!lerCode) {
      return NextResponse.json(
        { error: 'Missing lerCode' },
        { status: 400 }
      );
    }

    // Call Supabase function to create reservation
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc('create_reservation' as never, {
      p_unit_id: unitAllocationId,
      p_agent_id: agentId,
      p_ler_code: lerCode,
      p_duration_minutes: durationMinutes,
    } as never);

    if (error) {
      console.error('Reservation creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create reservation', details: error.message },
        { status: 500 }
      );
    }

    // The function returns a single row with success, message, unit_id, expires_at
    type ReservationResult = { success: boolean; message: string; unit_id: string; expires_at: string | null };
    const result = (data as ReservationResult[] | null)?.[0] ?? null;

    if (!result || !result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result?.message || 'Reservation failed',
          expiresAt: result?.expires_at || null,
        },
        { status: 409 } // Conflict
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      unitId: result.unit_id,
      expiresAt: result.expires_at,
    });
  } catch (error) {
    console.error('Reservation API error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
