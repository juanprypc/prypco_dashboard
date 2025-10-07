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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();

  if (!code) {
    return json({ error: 'code is required' }, { status: 400 });
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
