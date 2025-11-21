import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';
import { getKvClient } from '@/lib/kvClient';

export const runtime = 'nodejs';

const CACHE_VERSION = 'v2';

function cacheKeyFor(agentId?: string | null, agentCode?: string | null) {
  return `loyalty:${CACHE_VERSION}:${agentId ?? ''}:${agentCode ?? ''}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(requiredEnv('STRIPE_SECRET_KEY'));
    event = stripe.webhooks.constructEvent(body, sig || '', webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook signature verification failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Filter to Collect sessions only: must be paid and carry our metadata
  if (session.payment_status !== 'paid') {
    return NextResponse.json({ received: true });
  }
  const hasCollectMeta =
    typeof session.metadata?.agentId === 'string' ||
    typeof session.metadata?.agentCode === 'string' ||
    typeof session.metadata?.expectedPoints === 'string';
  if (!hasCollectMeta) {
    return NextResponse.json({ received: true });
  }
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const externalRef = paymentIntent ? `STRIPE|${paymentIntent}` : `STRIPE|${session.id}`;

  const agentId = typeof session.metadata?.agentId === 'string' ? session.metadata.agentId.trim() : null;
  const agentCode = typeof session.metadata?.agentCode === 'string' ? session.metadata.agentCode.trim() : null;
  const points = Number(session.metadata?.expectedPoints) || 0;
  const earnedAt = new Date().toISOString();

  const supabase = getSupabaseAdminClient();
  const kv = getKvClient();

  const upsertPayload = {
    id: crypto.randomUUID(),
    agent_id: agentId,
    agent_code: agentCode,
    points,
    type: 'purchase',
    rule_code: 'TOPUP_STRIPE',
    status: 'posted',
    earned_at: earnedAt,
    created_time: earnedAt,
    updated_at: earnedAt,
    external_ref: externalRef,
  };

  const { error } = await supabase
    .from('loyalty_points')
    .upsert(upsertPayload, { onConflict: 'external_ref' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Invalidate cache for this agent
  const keys = new Set<string>();
  keys.add(cacheKeyFor(agentId, agentCode));
  keys.add(cacheKeyFor(agentId, null));
  keys.add(cacheKeyFor(null, agentCode));
  await Promise.all(Array.from(keys).map((key) => kv.del(key).catch(() => undefined)));

  return NextResponse.json({ received: true });
}
