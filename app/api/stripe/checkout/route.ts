import Stripe from 'stripe';

export const runtime = 'nodejs';

type CheckoutPayload = {
  agentId?: string;
  agentCode?: string;
  baseQuery?: string;
  amountAED?: number;
};

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

    const requestedAmount = typeof body.amountAED === 'number' && !Number.isNaN(body.amountAED) ? body.amountAED : minTopup;
    const multiples = Math.max(1, Math.ceil(requestedAmount / minTopup));
    const normalizedAmount = multiples * minTopup;
    const points = Math.floor(normalizedAmount * pointsPerAed);

    const stripe = new Stripe(secretKey, { apiVersion: '2025-08-27.basil' });

    const baseParams = new URLSearchParams(body.baseQuery || '');
    if (agentId && !baseParams.has('agent')) baseParams.set('agent', agentId);
    if (agentCode && !baseParams.has('agentCode')) baseParams.set('agentCode', agentCode);

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
      line_items: [
        {
          price_data: {
            currency: 'aed',
            product_data: { name: `Prypco Points — ${points.toLocaleString()} pts` },
            unit_amount: normalizedAmount * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        ...(agentId ? { agentId } : {}),
        ...(agentCode ? { agentCode } : {}),
        amountAED: String(normalizedAmount),
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
    const message = error instanceof Error ? error.message : 'Stripe error';
    return Response.json({ error: message }, { status: 500 });
  }
}
