import { Sentry } from '@/lib/sentry';
import Stripe from 'stripe';

export const runtime = 'nodejs';

type CheckoutPayload = {
  agentId?: string;
  agentCode?: string;
  baseQuery?: string;
  amountAED?: number;
  rewardId?: string;
  allocationId?: string;
  lerCode?: string;
};

const STRIPE_MAX_AED = Number(process.env.STRIPE_MAX_AED || 999999);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CheckoutPayload;
    const agentId = body.agentId?.trim();
    const agentCode = body.agentCode?.trim();
    if (!agentId && !agentCode) {
      return Response.json({ error: 'Missing agent identifier' }, { status: 400 });
    }

    const secretKey = requiredEnv('STRIPE_SECRET_KEY');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const minTopup = Number(process.env.MIN_TOPUP_AED || 500);
    const pointsPerAed = Number(process.env.POINTS_PER_AED || 2);

    // Check if this is a redemption context (has rewardId or allocationId)
    // In redemption context, allow ANY amount (no minimum)
    // In regular top-up context, enforce MIN_TOPUP_AED
    const isRedemptionContext = !!(body.rewardId || body.allocationId || body.lerCode);
    const effectiveMinimum = isRedemptionContext ? 2 : minTopup; // 2 AED minimum (Stripe requirement for AED)

    const requestedAmount = typeof body.amountAED === "number" && !Number.isNaN(body.amountAED) ? body.amountAED : effectiveMinimum;
    const amountAED = requestedAmount < effectiveMinimum ? effectiveMinimum : requestedAmount;
    const points = Math.floor(amountAED * pointsPerAed);

    if (amountAED > STRIPE_MAX_AED) {
      return Response.json(
        {
          error: `Amount exceeds Stripe limit of AED ${STRIPE_MAX_AED.toLocaleString()}. Please top up in smaller steps.`,
        },
        { status: 400 }
      );
    }

    const stripe = new Stripe(secretKey);

    const baseParams = new URLSearchParams(body.baseQuery || '');
    if (agentId && !baseParams.has('agent')) baseParams.set('agent', agentId);
    if (agentCode && !baseParams.has('agentCode')) baseParams.set('agentCode', agentCode);
    if (body.rewardId && !baseParams.has('reward')) baseParams.set('reward', body.rewardId);
    if (body.allocationId && !baseParams.has('allocation')) baseParams.set('allocation', body.allocationId);
    if (body.lerCode && !baseParams.has('ler')) baseParams.set('ler', body.lerCode);
    // Ensure we land back on the catalogue/flow when coming from a reward context
    if (body.rewardId && !baseParams.has('view')) baseParams.set('view', 'catalogue');

    const successParams = new URLSearchParams(baseParams);
    successParams.set('topup', 'success');
    const cancelParams = new URLSearchParams(baseParams);
    cancelParams.set('topup', 'cancel');

    const buildUrl = (params: URLSearchParams) => {
      const qs = params.toString();
      return qs ? `${appUrl}/dashboard?${qs}` : `${appUrl}/dashboard`;
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: 'aed',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'aed',
            product_data: { name: `Prypco Points — ${points.toLocaleString()} pts` },
            unit_amount: amountAED * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        ...(agentId ? { agentId } : {}),
        ...(agentCode ? { agentCode } : {}),
        amountAED: String(amountAED),
        pointsPerAED: String(pointsPerAed),
        expectedPoints: String(points),
      },
      success_url: buildUrl(successParams),
      cancel_url: buildUrl(cancelParams),
    });

    if (!session.url) {
      throw new Error('Stripe session missing redirect URL');
    }

    return Response.json({ url: session.url });
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : 'Stripe error';
    return Response.json({ error: message }, { status: 500 });
  }
}
