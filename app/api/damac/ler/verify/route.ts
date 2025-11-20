import { NextResponse, type NextRequest } from 'next/server';
import { fetchDamacRedemptionByCode } from '@/lib/damac';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';

const LER_PREFIX = 'LER-';

type VerifyResponse =
  | { ok: true }
  | { ok: false; reason: 'invalid_input' | 'already_used'; message: string };

const normalizeLer = (value: string): string | null => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.startsWith(LER_PREFIX) ? trimmed.slice(LER_PREFIX.length) : trimmed;
  const digitsOnly = withoutPrefix.replace(/\D/g, '');
  if (digitsOnly.length < 4) return null;
  return `${LER_PREFIX}${digitsOnly}`;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const input = typeof body?.ler === 'string' ? body.ler : '';
    const normalized = normalizeLer(input);
    if (!normalized) {
      const payload: VerifyResponse = { ok: false, reason: 'invalid_input', message: 'Invalid LER number.' };
      return NextResponse.json(payload, { status: 400 });
    }

    // Check for an in-flight pending redemption or active reservation with this LER
    const supabase = getSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    const { data: pendingRows, error: pendingError } = await supabase
      .from('pending_redemptions' as never)
      .select('id')
      .eq('ler_code', normalized)
      .gt('expires_at', nowIso)
      .limit(1);

    if (pendingError) {
      throw new Error(`Failed to check pending redemptions: ${pendingError.message}`);
    }

    if (pendingRows && pendingRows.length > 0) {
      const payload: VerifyResponse & { ler: string } = {
        ok: false,
        reason: 'already_used',
        message: 'This LER is already being processed. Try a different LER.',
        ler: normalized,
      };
      console.warn('LER verify 409: pending hold', payload);
      return NextResponse.json(payload, { status: 409 });
    }

    const { data: reservationRows, error: reservationError } = await supabase
      .from('unit_allocations' as never)
      .select('id,reservation_expires_at')
      .eq('reserved_ler_code', normalized)
      .gt('reservation_expires_at', nowIso)
      .limit(1);

    if (reservationError) {
      throw new Error(`Failed to check active reservations: ${reservationError.message}`);
    }

    if (reservationRows && reservationRows.length > 0) {
      const payload: VerifyResponse & { ler: string } = {
        ok: false,
        reason: 'already_used',
        message: 'This LER is already reserved on another unit.',
        ler: normalized,
      };
      console.warn('LER verify 409: active reservation', payload);
      return NextResponse.json(payload, { status: 409 });
    }

    const record = await fetchDamacRedemptionByCode(normalized);
    if (record) {
      const payload: VerifyResponse & { ler: string } = {
        ok: false,
        reason: 'already_used',
        message: 'This LER has already been used on a previous redemption.',
        ler: normalized,
      };
      console.warn('LER verify 409: already redeemed', payload);
      return NextResponse.json(payload, { status: 409 });
    }

    const payload: VerifyResponse = { ok: true };
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('LER verify error:', error);
    return NextResponse.json({ ok: false, reason: 'invalid_input', message: 'Unable to verify LER right now.' }, { status: 500 });
  }
}
