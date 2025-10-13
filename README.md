This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prypco Loyalty Dashboard

A minimal server-rendered dashboard backed by Airtable `loyalty_points` with:

- Server-only API route: `app/api/loyalty/route.ts`
- Dashboard UI: `app/dashboard/page.tsx`
- Airtable client: `lib/airtable.ts`

### Configure

1) Copy env example and fill your Airtable values:

```
cp .env.local.example .env.local
# edit .env.local
```

Required env vars:

- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE` (base id `appXXXXXXXXXXXX`)
- `AIRTABLE_TABLE_LOY` (table name, e.g., `loyalty_points`)
- `AIRTABLE_TABLE_AGENTS` (optional fallback for display name lookups)
- `AIRTABLE_TABLE_CATALOGUE` (rewards table name, e.g., `loyalty_catalogue`)
- `AIRTABLE_FIELD_AGENT_CODE` (text/lookup field with the agent code, e.g., `Agents ID`)
- `AIRTABLE_RATE_LIMIT` (optional, defaults to `5` requests/sec)
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `MIN_TOPUP_AED` (default `500`)
- `POINTS_PER_AED` (default `2`)
- `NEXT_PUBLIC_APP_URL`
- `KV_KV_REST_API_URL`, `KV_KV_REST_API_TOKEN`, `KV_KV_URL` (Upstash/Vercel KV connection)
- (Optional) `KV_KV_REST_API_READ_ONLY_TOKEN`
- (Optional) `LOYALTY_CACHE_TTL` (defaults to `60` seconds)

Redis-backed caching: provision an Upstash Redis database from the Vercel Marketplace, connect it to this project, then run `vercel env pull .env.local` so the KV variables are available locally. The `/api/loyalty` endpoint caches each agent’s payload in Redis to reduce Airtable traffic; the TTL governs how long entries are reused before refreshing.

### Monitoring

- `SENTRY_DSN` for server-side capture (optional `SENTRY_TRACES_SAMPLE_RATE`, defaults to `0.05`).
- `NEXT_PUBLIC_SENTRY_DSN` for client capture (optional `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, defaults to `0`).

Sentry initialization lives in `sentry.server.config.ts`, `sentry.client.config.ts`, and `sentry.edge.config.ts`. API routes call `Sentry.captureException(err)` so Airtable/Stripe failures show up immediately in your Sentry project.

2) Start dev server:

```
npm run dev
```

3) Open the dashboard with an agent record id:

```
http://localhost:3000/dashboard?agent=recXXXXXXXXXXXX
```

Use `view=catalogue` to jump to the rewards catalogue tab:

```
http://localhost:3000/dashboard?agent=recXXXXXXXXXXXX&view=catalogue
```

If you prefer to reference agents by a custom code/lookup (e.g., `AG1234`), pass `agentCode` instead and make sure the lookup is exposed on `loyalty_points` via `AIRTABLE_FIELD_AGENT_CODE`:

```
http://localhost:3000/dashboard?agentCode=AG1234
```

API (server-only) test:

```
http://localhost:3000/api/loyalty?agent=recXXXXXXXXXXXX
```

Notes:

- The API filters: `status = posted` and unexpired rows (`expires_at` empty or >= today), and matches the `agent` linked record via `FIND('<agentId>', ARRAYJOIN({agent}))`.
- In production, replace the `?agent=` dev parameter with auth middleware that injects `agentId`.
- Stripe Checkout is exposed at `/api/stripe/checkout`. Configure a Stripe webhook (e.g., `checkout.session.completed`) to post directly to your Airtable automation webhook so points can be credited server-side.

### Stripe Top-up Flow

1. Populate Stripe env vars (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `MIN_TOPUP_AED`, `POINTS_PER_AED`, `NEXT_PUBLIC_APP_URL`).
2. In Stripe (test mode), create a Checkout webhook endpoint targeting your Airtable automation URL and subscribe to `checkout.session.completed` events.
3. From the dashboard, agents can launch Checkout via the “Buy points” card. Metadata sent to Stripe includes `agentId`, `amountAED`, `pointsPerAED`, and `expectedPoints` so Airtable can post the ledger row when the webhook fires.

### Receipt Generation API

- **Endpoint:** `POST /api/receipts`
- **Runtime:** Node.js (PDFKit)
- **Auth:** Optional bearer token (`RECEIPT_WEBHOOK_SECRET`). When set, requests must include `Authorization: Bearer <secret>`.

Send this payload from your Airtable automation once a top-up row is created:

```json
{
  "agentCode": "AG12345",
  "amount": 2500,
  "points": 5000,
  "paidAt": "2025-02-01T09:45:12Z",
  "reference": "cs_live_123",
  "memo": "Optional note to show on the receipt"
}
```

Provide either `agentProfileId` (Supabase `agent_profiles.id`) or `agentCode`. `amount`, `points`, and `recordId` are required. `paidAt` defaults to “now” when omitted. `reference` becomes the receipt number (a UUID is generated when missing). The endpoint looks up the agent in Supabase to populate the “Received from Ms./Mr.” line; you can optionally supply `agentName` in the payload to override that lookup.

By default the API uploads the generated PDF to Supabase Storage and then instructs Airtable to fetch it. Configure these variables:

- `AIRTABLE_API_KEY` (or `AIRTABLE_PAT`) – personal access token with write access to the base.
- `AIRTABLE_BASE` (or `AIRTABLE_BASE_ID`) – Airtable base ID (e.g. `appfpvMsWzOFxl8ug`).
- `AIRTABLE_RECEIPT_TABLE_ID` – table ID or name containing the ledger rows (defaults to `AIRTABLE_TABLE_ID`).
- `AIRTABLE_RECEIPT_FIELD_ID` – attachment field ID (recommended).  
  Optionally set `AIRTABLE_RECEIPT_FIELD_NAME` if you prefer to update by field name.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` – already required for the rest of the project.
- `SUPABASE_RECEIPTS_BUCKET` – private Supabase Storage bucket where PDFs are written (defaults to `receipts`).
- `SUPABASE_SIGNED_URL_TTL_SECONDS` (optional) – lifetime of the signed download URL Airtable uses (defaults to 300 seconds).

You can override any of these per request with `baseId`, `tableId`, `receiptFieldId`, `receiptFieldName`, or disable replacement by passing `replaceExisting: false`.

The response payload still includes the PDF metadata (and base64) for convenience:

```json
{
  "ok": true,
  "receipt": {
    "filename": "receipt-cs_live_123.pdf",
    "base64": "<PDF bytes>",
    "receiptNumber": "cs_live_123",
    "agentName": "Alex Agent",
    "issuedAt": "2025-02-01T09:45:12.000Z",
    "amount": 2500,
    "points": 5000
  }
}
```

Example Airtable script snippet:

```js
const secret = 'REPLACE_WITH_RECEIPT_SECRET';
const response = await fetch('https://your-deploy.vercel.app/api/receipts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`
  },
  body: JSON.stringify({
    recordId: input.config().recordId,
    amount: Number(input.config().amount),
    points: Number(input.config().points),
    paidAt: input.config().paidAt,
    agentCode: input.config().agentCode,
    reference: input.config().reference
  })
});

const json = await response.json();
if (!response.ok || !json.ok) {
  throw new Error(json.error || `Receipt API failed with ${response.status}`);
}

output.markdown(`✅ Receipt stored for record \`${input.config().recordId}\``);
```

No extra attachment handling is needed—the API uploads the PDF to Airtable and updates the `receipt` field automatically.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
