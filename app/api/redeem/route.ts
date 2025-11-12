import { Sentry } from '@/lib/sentry';
import { NextResponse } from 'next/server';

const webhookUrl = process.env.AIRTABLE_REDEEM_WEBHOOK;

export async function POST(request: Request) {
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

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
      throw new Error(text || `Webhook responded with ${res.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : 'Failed to submit redemption';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
