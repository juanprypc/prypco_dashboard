import { NextResponse } from 'next/server';
import { Sentry } from '@/lib/sentry';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';
import { fetchDamacRedemptionByCode } from '@/lib/damac';

const webhookUrl = process.env.AIRTABLE_REDEEM_WEBHOOK;
const supabase = getSupabaseAdminClient();

type ReservationCheck = {
  ok: boolean;
  remainingStock: number;
};

type UnitAllocationReservationRow = {
  reserved_by: string | null;
  reserved_at: string | null;
  reserved_ler_code: string | null;
  reservation_expires_at: string | null;
  remaining_stock: number | null;
  released_status: string | null;
  synced_at: string | null;
  updated_at: string | null;
};

type BalanceCheckResult = {
  success: boolean;
  message: string;
  pending_id: string | null;
  available_balance: number;
  required_points: number;
};

async function verifyActiveReservation(unitAllocationId: string, agentKey: string): Promise<ReservationCheck> {
  const { data, error } = await supabase
    .from('unit_allocations')
    .select('reserved_by,reservation_expires_at,remaining_stock')
    .eq('id', unitAllocationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { ok: false, remainingStock: 0 };
  }

  const row = data as UnitAllocationReservationRow;
  const expiresAt = row.reservation_expires_at ? Date.parse(row.reservation_expires_at) : null;
  const stillReserved =
    row.reserved_by === agentKey &&
    (expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > Date.now()));

  if (!stillReserved) {
    return { ok: false, remainingStock: 0 };
  }

  const remainingStock = typeof row.remaining_stock === 'number' ? row.remaining_stock : 0;
  if (remainingStock <= 0) {
    return { ok: false, remainingStock: 0 };
  }

  return { ok: true, remainingStock };
}

async function finalizeReservation(unitAllocationId: string, agentKey: string, currentStock: number) {
  const nextStock = Math.max(0, currentStock - 1);
  const updatePayload: Record<string, unknown> = {
    reserved_by: null,
    reserved_at: null,
    reserved_ler_code: null,
    reservation_expires_at: null,
    remaining_stock: nextStock,
    released_status: nextStock === 0 ? 'Not Released' : 'Available',
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('unit_allocations' as never)
    .update(updatePayload as never)
    .eq('id', unitAllocationId)
    .eq('reserved_by', agentKey);

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let pendingRedemptionId: string | null = null;

  try {
    const body = (await request.json()) as {
      agentId?: string | null;
      agentCode?: string | null;
      rewardId?: string;
      rewardName?: string;
      rewardPoints?: number | null;
      priceAed?: number | null;
      unitAllocationId?: string | null;
      unitAllocationLabel?: string | null;
      unitAllocationPoints?: number | null;
      requiresBuyerVerification?: boolean;
      customerFirstName?: string;
      customerPhoneLast4?: string;
      damacLerReference?: string | null;
    };

    if (!body?.agentId && !body?.agentCode) {
      return NextResponse.json({ error: 'Missing agent identifier' }, { status: 400 });
    }

    if (!body?.rewardId) {
      return NextResponse.json({ error: 'Missing reward identifier' }, { status: 400 });
    }

    const rawUnitAllocationId =
      typeof body?.unitAllocationId === 'string' ? body.unitAllocationId.trim() : '';
    const unitAllocationId = rawUnitAllocationId.length > 0 ? rawUnitAllocationId : null;
    const hasUnitAllocation = unitAllocationId !== null;
    const damacLerReference =
      typeof body?.damacLerReference === 'string' && body.damacLerReference.trim()
        ? body.damacLerReference.trim()
        : null;
    const skipBuyerVerification = !!damacLerReference;
    const requiresBuyerVerification =
      skipBuyerVerification ? false : body.requiresBuyerVerification === true || hasUnitAllocation;
    const customerFirstName = typeof body?.customerFirstName === 'string' ? body.customerFirstName.trim() : '';
    const customerPhoneLast4 = typeof body?.customerPhoneLast4 === 'string' ? body.customerPhoneLast4.trim() : '';
    const phoneProvided = customerPhoneLast4.length > 0;
    const phoneLooksValid = /^\d{4}$/.test(customerPhoneLast4);

    if (requiresBuyerVerification && !customerFirstName) {
      return NextResponse.json({ error: 'Buyer first name is required' }, { status: 400 });
    }

    if ((requiresBuyerVerification || phoneProvided) && !phoneLooksValid) {
      return NextResponse.json({ error: 'Buyer phone last four digits are invalid' }, { status: 400 });
    }

    const reservationKey = (body.agentId?.trim() || body.agentCode?.trim() || '') || null;
    let reservationContext: ReservationCheck | null = null;
    if (unitAllocationId && reservationKey) {
      reservationContext = await verifyActiveReservation(unitAllocationId, reservationKey);
      if (!reservationContext.ok) {
        return NextResponse.json(
          { error: 'This unit is no longer reserved. Please pick another allocation.' },
          { status: 409 },
        );
      }
    }

    // Check LER uniqueness to prevent race condition where same LER books multiple units
    if (damacLerReference) {
      const existingRedemption = await fetchDamacRedemptionByCode(damacLerReference);
      if (existingRedemption) {
        return NextResponse.json(
          { error: 'This LER code has already been used for another redemption' },
          { status: 409 },
        );
      }
    }

    // Atomic balance check - reserves points to prevent concurrent overbooking
    const requiredPoints = typeof body.rewardPoints === 'number' ? body.rewardPoints : 0;

    if (requiredPoints > 0) {
      const { data: balanceData, error: balanceError } = await supabase
        .rpc('check_and_reserve_balance' as never, {
          p_agent_id: body.agentId ?? null,
          p_agent_code: body.agentCode ?? null,
          p_required_points: requiredPoints,
          p_unit_allocation_id: unitAllocationId,
          p_ler_code: damacLerReference
        } as never);

      if (balanceError) {
        console.error('Balance check error:', balanceError);
        return NextResponse.json(
          { error: 'Failed to check balance' },
          { status: 500 },
        );
      }

      const balanceResult = (balanceData as BalanceCheckResult[] | null)?.[0];
      if (!balanceResult?.success) {
        return NextResponse.json(
          {
            error: 'Insufficient balance. You need ' + requiredPoints.toLocaleString() + ' points but only have ' + (balanceResult?.available_balance ?? 0).toLocaleString() + ' points.',
            required: requiredPoints,
            available: balanceResult?.available_balance ?? 0,
          },
          { status: 400 },
        );
      }

      pendingRedemptionId = balanceResult.pending_id;
    }

    const payload = {
      agentId: body.agentId ?? null,
      agentCode: body.agentCode ?? null,
      rewardId: body.rewardId,
      rewardName: body.rewardName ?? null,
      rewardPoints: typeof body.rewardPoints === 'number' ? body.rewardPoints : null,
      priceAed: typeof body.priceAed === 'number' ? body.priceAed : null,
      unitAllocationId,
      unitAllocationLabel:
        typeof body.unitAllocationLabel === 'string' && body.unitAllocationLabel.trim()
          ? body.unitAllocationLabel.trim()
          : null,
      unitAllocationPoints:
        typeof body.unitAllocationPoints === 'number' && Number.isFinite(body.unitAllocationPoints)
          ? body.unitAllocationPoints
          : null,
      customerFirstName: customerFirstName || null,
      customerPhoneLast4: phoneLooksValid ? customerPhoneLast4 || null : null,
      damacLerReference,
      requestedAt: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      // Cancel the pending redemption since webhook failed
      if (pendingRedemptionId) {
        await supabase.rpc('cancel_pending_redemption' as never, { p_pending_id: pendingRedemptionId } as never);
      }
      throw new Error(text || 'Webhook responded with ' + res.status);
    }

    // Finalize the pending redemption (remove the hold)
    if (pendingRedemptionId) {
      await supabase.rpc('finalize_pending_redemption' as never, { p_pending_id: pendingRedemptionId } as never);
    }

    if (unitAllocationId && reservationKey && reservationContext) {
      try {
        await finalizeReservation(unitAllocationId, reservationKey, reservationContext.remainingStock);
      } catch (error) {
        console.error('Failed to finalize reservation in Supabase', error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Cancel pending redemption on any error
    if (pendingRedemptionId) {
      try {
        await supabase.rpc('cancel_pending_redemption' as never, { p_pending_id: pendingRedemptionId } as never);
      } catch (cancelError) {
        console.error('Failed to cancel pending redemption:', cancelError);
      }
    }

    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : 'Failed to submit redemption';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
