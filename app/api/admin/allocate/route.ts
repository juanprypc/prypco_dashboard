import { NextResponse } from 'next/server';
import { fetchAgentProfileByCode } from '@/lib/supabaseLoyalty';
import { fetchLoyaltyCatalogue, type CatalogueItemWithAllocations } from '@/lib/airtable';
import { normalizeLer } from '@/lib/damacAdmin';
import { fetchDamacRedemptionByCode } from '@/lib/damac';

const webhookUrl = process.env.AIRTABLE_REDEEM_WEBHOOK;

// TODO: Add authentication middleware

type AllocateRequest = {
  agentCode: string;
  unitAllocationId: string;
  lerReference: string;
};

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === 'checked';
  }
  return false;
}

export async function POST(request: Request) {
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  try {
    const body = (await request.json()) as AllocateRequest;

    // Validate required fields
    if (!body.agentCode?.trim()) {
      return NextResponse.json({ error: 'Agent code is required' }, { status: 400 });
    }
    if (!body.unitAllocationId?.trim()) {
      return NextResponse.json({ error: 'Unit allocation is required' }, { status: 400 });
    }
    if (!body.lerReference?.trim()) {
      return NextResponse.json({ error: 'LER reference is required' }, { status: 400 });
    }

    // 1. Validate agent exists
    const agent = await fetchAgentProfileByCode(body.agentCode.trim());
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // 2. Validate LER is unique
    const normalizedLer = normalizeLer(body.lerReference);
    if (!normalizedLer) {
      return NextResponse.json({ error: 'Invalid LER format' }, { status: 400 });
    }

    const existingRedemption = await fetchDamacRedemptionByCode(normalizedLer);
    if (existingRedemption) {
      return NextResponse.json(
        { error: 'This LER code has already been used for another redemption' },
        { status: 409 }
      );
    }

    // 3. Fetch catalogue and find unit
    const catalogue = await fetchLoyaltyCatalogue();

    let catalogueItem: CatalogueItemWithAllocations | null = null;
    let unitAllocation = null;

    for (const item of catalogue) {
      if (!toBoolean(item.fields?.damacIslandCampaign)) continue;

      const allocation = item.unitAllocations?.find((u) => u.id === body.unitAllocationId);
      if (allocation) {
        catalogueItem = item;
        unitAllocation = allocation;
        break;
      }
    }

    if (!catalogueItem || !unitAllocation) {
      return NextResponse.json(
        { error: 'Unit allocation not found or not a DAMAC Island Campaign item' },
        { status: 404 }
      );
    }

    // 4. Check remaining stock (admin can override, but warn if 0)
    const remainingStock =
      typeof unitAllocation.remainingStock === 'number' ? unitAllocation.remainingStock : 0;

    if (remainingStock <= 0) {
      console.warn(`⚠️  Admin allocating unit with 0 stock: ${body.unitAllocationId}`);
    }

    // 5. Get agent's current balance
    const loyaltyRes = await fetch(
      `${request.headers.get('origin') || 'http://localhost:3000'}/api/loyalty?agentCode=${agent.code}`,
      { headers: { cookie: request.headers.get('cookie') || '' } }
    );

    if (!loyaltyRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch agent balance' }, { status: 500 });
    }

    const loyaltyData = (await loyaltyRes.json()) as { totals?: { totalPoints?: number } };
    const agentBalance = loyaltyData.totals?.totalPoints ?? 0;
    const requiredPoints = typeof unitAllocation.points === 'number' ? unitAllocation.points : 0;

    if (agentBalance < requiredPoints) {
      return NextResponse.json(
        {
          error: 'Agent does not have enough points',
          required: requiredPoints,
          available: agentBalance,
        },
        { status: 400 }
      );
    }

    // 6. Build unit label for webhook
    const unitLabel = [unitAllocation.damacIslandcode, unitAllocation.unitType, unitAllocation.brType]
      .filter(Boolean)
      .join(' - ');

    // 7. Submit to webhook
    const payload = {
      agentId: agent.id,
      agentCode: agent.code,
      rewardId: catalogueItem.id,
      rewardName: catalogueItem.fields?.name || null,
      rewardPoints: requiredPoints,
      priceAed: unitAllocation.priceAed ?? catalogueItem.fields?.price_aed ?? null,
      unitAllocationId: unitAllocation.id,
      unitAllocationLabel: unitLabel || null,
      unitAllocationPoints: requiredPoints,
      damacLerReference: normalizedLer,
      requestedAt: new Date().toISOString(),
    };

    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!webhookRes.ok) {
      const text = await webhookRes.text();
      throw new Error(text || `Webhook responded with ${webhookRes.status}`);
    }

    return NextResponse.json({
      ok: true,
      allocation: {
        agent: agent.displayName,
        unit: unitLabel,
        points: requiredPoints,
        ler: normalizedLer,
      },
    });
  } catch (error) {
    console.error('Admin allocation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to allocate unit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
