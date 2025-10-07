import { NextResponse } from 'next/server';
import {
  fetchDamacRedemptionByCode,
  fetchDamacRedemptionById,
  markDamacRedemptionAsRedeemed,
  type DamacRedemptionRecord,
} from '@/lib/damac';

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    headers: {
      'cache-control': 'no-store',
      ...init?.headers,
    },
    status: init?.status,
  });
}

function normalizeName(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();
  const firstName = url.searchParams.get('firstName')?.trim();
  const phoneLast4 = url.searchParams.get('phoneLast4')?.trim();

  if (!code || !firstName || !phoneLast4) {
    return json({ error: 'code, firstName, and phoneLast4 are required' }, { status: 400 });
  }

  if (!/^\d{4}$/.test(phoneLast4)) {
    return json({ error: 'phoneLast4 must contain exactly four digits' }, { status: 400 });
  }

  let record: DamacRedemptionRecord | null;
  try {
    record = await fetchDamacRedemptionByCode(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lookup failed';
    return json({ error: message }, { status: 500 });
  }

  if (!record) {
    return json({ error: 'No redemption found for that code.' }, { status: 404 });
  }

  const expectedName = normalizeName(record.unitAllocationFirstName);
  const providedName = normalizeName(firstName);
  if (expectedName && expectedName !== providedName) {
    return json({
      error: 'Buyer first name does not match our records. Please double-check with the agent.',
      code: 'name_mismatch',
    }, { status: 422 });
  }

  const expectedPhone = (record.unitAllocationPhoneLast4 ?? '').trim();
  if (expectedPhone && expectedPhone !== phoneLast4) {
    return json({
      error: 'Last four digits do not match. Confirm with the agent before proceeding.',
      code: 'phone_mismatch',
    }, { status: 422 });
  }

  return json({ record });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { recordId?: string; operatorName?: string; note?: string }
    | null;

  const recordId = body?.recordId?.trim();
  const operatorName = body?.operatorName?.trim() ?? null;
  const note = body?.note?.trim() ?? null;

  if (!recordId) {
    return json({ error: 'recordId is required' }, { status: 400 });
  }

  let record: DamacRedemptionRecord | null;
  try {
    record = await fetchDamacRedemptionById(recordId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lookup failed';
    return json({ error: message }, { status: 500 });
  }

  if (!record) {
    return json({ error: 'Redemption not found.' }, { status: 404 });
  }

  if (record.redeemed) {
    return json({ error: 'This code has already been confirmed.' }, { status: 409 });
  }

  try {
    await markDamacRedemptionAsRedeemed(recordId, operatorName, note);
    const updated = await fetchDamacRedemptionById(recordId);
    return json({ record: updated ?? record });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update redemption';
    return json({ error: message }, { status: 500 });
  }
}
