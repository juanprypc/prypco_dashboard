# Collect Architecture Overview

Comprehensive picture of the “Collect” loyalty dashboard, catalogue store, and supporting services.

## 1. Product Scope
- **Collect dashboard** – `/dashboard` shows loyalty balances, activity history, reward catalogue, and learn content, tailored to a single agent (query params `agent`/`agentCode`).
- **Collect store** – the catalogue tab inside the dashboard lists rewards sourced from Airtable, supports property-specific unit allocations, enforces reward terms, and lets agents submit redemption requests or top up points.
- **Operational tooling** – admin analytics (`/admin/analytics`) and Damac redemption confirmations (`/app/api/damac`) share the same backend services and data stores.

## 2. Tech Stack & Infra
- **Runtime**: Next.js App Router (Node runtime for applicable API routes), TypeScript throughout.
- **Primary datastore**: Supabase PostgreSQL for normalized loyalty ledger tables, agent profiles, monthly aggregates (see `supabase/migrations`).
- **Source of truth for catalogue & legacy ledgers**: Airtable (multiple tables, accessed via REST API).
- **Caching & rate protection**:
  - `@vercel/kv` (Upstash Redis) for dashboard payloads and catalogue cache.
  - Custom Airtable rate limiter in `lib/airtableRateLimiter.ts`.
- **Payments**: Stripe Checkout for point purchases (`app/api/stripe/checkout/route.ts`).
- **Documents**: Supabase Storage for receipt PDFs, Airtable attachment sync (`app/api/receipts/route.ts`).
- **Observability**: Sentry (server/client initializers in `lib/sentry.ts` and project configs).
- **Environment**: Configured via `.env.local` as documented in `README.md`.

## 3. Data Domains & Integrations

### Airtable
- **Loyalty catalogue** (`loyalty_catalogue`), **unit allocations** (`loyalty_unit_allocation`), and **Damac loyalty table** (env `AIRTABLE_TABLE_LOY`) pulled through `lib/airtable.ts` and `lib/damac.ts`.
- **Receipts**: attachments updated via Airtable REST in `syncReceiptToAirtable` (`app/api/receipts/route.ts`:449).
- **Redemption webhook**: `app/api/redeem/route.ts` forwards validated redemption requests to `AIRTABLE_REDEEM_WEBHOOK`.

### Supabase
- Tables defined in `supabase/migrations/*.sql`:
  - `agent_profiles`, `loyalty_points`, `loyalty_points_monthly`.
  - RPC helpers `loyalty_admin_*` for analytics.
- Access layer in `lib/supabaseClient.ts` (admin client) and `lib/supabaseLoyalty.ts`.
  - Maps rows to public DTOs consumed by APIs and UI.

### KV (Redis via Upstash)
- Instantiated in `lib/kvClient.ts`.
- `/api/loyalty` caches per-agent payloads (key `loyalty:${version}:${agentId}:${agentCode}`).
- `/api/catalogue` and cron warmup endpoints cache the latest catalogue (`CATALOGUE_CACHE_KEY`).

### Stripe
- Checkout sessions are provisioned by `app/api/stripe/checkout/route.ts`. Metadata carries identifiers `agentId`, `agentCode`, `amountAED`, `pointsPerAED`, `expectedPoints` so downstream Airtable automations can credit ledger entries.

## 4. Application Layers

### UI (App Router Pages & Components)
- `app/dashboard/page.tsx` renders client component `DashboardClient` with server-derived props (env configuration, tab routes).
- `DashboardClient` orchestrates data fetching for both ledger and catalogue, handles redemption and top-up dialogs, and renders:
  - `CatalogueGrid`, selection dialogs, redemption modal.
  - `ActivitySection` / `ActivityTable` for ledger rows.
  - `BuyPointsButton`, `TopupBanner`, `NavigationTabs`, KPI cards, referral widgets.
- Admin analytics UI (`app/admin/analytics/page.tsx`) loads data server-side and renders `AdminAnalyticsDashboard`.

### API Routes (Node runtime unless noted)
- `app/api/loyalty/route.ts`: Supabase→DTO→cache pipeline for ledger data, includes monthly summary, totals, optional debug payload.
- `app/api/catalogue/route.ts`: fetches Airtable catalogue, merges allocations, caches in KV using TTL safeguards defined in `lib/catalogueCache.ts`.
- `app/api/cron/warm-catalogue/route.ts`: guards with `CRON_SECRET` and Vercel signature header, refreshes cache proactively.
- `app/api/redeem/route.ts`: validates redemption requests (agent identity, reward info, buyer verification), forwards to Airtable webhook.
- `app/api/stripe/checkout/route.ts`: calculates purchase amount within min/limit bounds, creates Stripe Checkout session with tailored return URLs.
- `app/api/receipts/route.ts`: generates PDF receipts (PDFKit), stores in Supabase Storage, syncs Airtable attachments.
- `app/api/damac/redemption/route.ts`: read/mark Damac redemption codes via Airtable.

### Libraries & Utilities
- `lib/airtable.ts`: typed wrappers for Airtable catalogue/unit allocation fetch, including incremental pagination and attachment parsing.
- `lib/catalogueCache.ts`: TTL computations, signed URL expiry detection ensuring cached assets remain valid.
- `lib/damac.ts`: typed interactions with Damac Airtable table, including field normalization and patch update.
- `lib/supabaseLoyalty.ts`: query helpers for agent profile lookup, ledger rows, monthly summaries, DTO mapping.
- `lib/adminAnalytics.ts`: Supabase RPC wrappers for overview, channel breakdown, monthly trends.
- `lib/clientAnalytics.ts`: thin wrapper around `@vercel/analytics`.
- `lib/format.ts`: number/date formatting shared across UI.

## 5. Collect Catalogue Flow
1. **Server fetch**: `/api/catalogue` calls `fetchLoyaltyCatalogue()` (Airtable REST) which:
   - Retrieves catalogue records in sorted batches (`lib/airtable.ts`:169).
   - Hydrates related unit allocations (multiple pages) and groups them by catalogue item.
   - Filters inactive rewards (`fields.is_active`).
2. **Caching**: Response stored in KV with TTL derived from `getSafeCatalogueCacheTtl` ensuring lifespan ≤ signed URL expiry.
3. **Client usage**: `DashboardClient.loadCatalogue()` fetches `/api/catalogue` (prefetch + forced refresh on active tab). Images set to refetch when errors occur, triggering a fresh API request.
4. **Warm-up**: Cron endpoint can refresh cache ahead of traffic, respecting optional shared secret.

## 6. Redemption Flow (Collect Store)
1. **User action**: From `CatalogueGrid`, clicking redeem triggers dialogs in `DashboardClient`.
2. **Eligibility checks**: Redeem dialog computes required points, enforces buyer verification when allocation data is present, checks reward terms acceptance and status gating (`getCatalogueStatusConfig`).
3. **Submission**: `/api/redeem` receives JSON, validates agent identifiers, reward info, unit allocation metadata, buyer details, enforces phone last-4 digit rule.
4. **Forwarding**: Payload forwarded to Airtable webhook (`AIRTABLE_REDEEM_WEBHOOK`) for fulfilment. API returns success/error for UI messaging.

## 7. Top-up (Stripe) Flow
1. `BuyPointsButton` or redemption modal calculates normalized amounts in `MIN_TOPUP_AED` increments.
2. `/api/stripe/checkout` ensures agent identifiers present, clamps amount to allowed bounds (`STRIPE_MAX_AED`), creates Checkout session with metadata.
3. Return URLs embed original dashboard query so the UI can display success/cancel banners and trigger data refresh.
4. Airtable automation (external) uses metadata to append ledger transactions; dashboard can re-fetch ledger (`forceFreshLoyalty`) post-success.

## 8. Loyalty Ledger Flow
1. `/api/loyalty` validates agent identity parameters, builds cache key, and optionally serves cached payload.
2. Data source: `fetchLoyaltyPointRows` (Supabase) filtered by agent id/code and status `posted`. Optional profile enhancement via `agent_profiles`.
3. Totals & monthly summaries computed server-side (`computeTotals`, `fetchMonthlySummaries`).
4. Client: `DashboardClient.loadData()` fetches `/api/loyalty`, handles retry on 429 (Airtable backoff), populates state for metrics, tables, referral cards.

## 9. Damac Islands Integration
- `app/api/damac/redemption/route.ts` exposes GET/POST to look up Damac redemption codes and mark them redeemed.
- Uses `lib/damac.ts` to query Airtable with normalized field mapping, automatically patching verification metadata (operator, note, timestamps).

## 10. Admin Analytics Stack
- Page: `app/admin/analytics/page.tsx` (server component).
- Data: `fetchAdminAnalytics` calls Supabase RPC (`loyalty_admin_overview`, `loyalty_admin_channel_breakdown`, `loyalty_admin_monthly`).
- UI: `AdminAnalyticsDashboard` renders stat cards, channel table, sparkline, liability breakdown; uses formatting utilities for points and AED.

## 11. Supporting Utilities & Guards
- **Rate limiting**: `scheduleAirtableRequest` ensures Airtable API requests respect configurable per-second cap.
- **Cache hygiene**: `catalogueCacheHasExpiringAsset` scans cached catalogue for soon-to-expire signed URLs and triggers refresh.
- **Env-driven behavior**: Values like `AIRTABLE_TIMEZONE`, `AIRTABLE_LOCALE`, TTLs, secrets, tops-up, etc., centralize configuration.
- **Retry/backoff**: Client side ledger fetch handles 429 by exponential backoff up to three attempts.
- **Analytics**: `emitAnalyticsEvent` forwards key user actions (e.g., reward redemption clicks, interest in coming soon rewards) to Vercel Analytics.

## 12. Key File Map
- `app/dashboard/page.tsx`, `components/DashboardClient.tsx` – core Collect dashboard UI and store flow.
- `app/api/catalogue/route.ts`, `lib/airtable.ts`, `lib/catalogueCache.ts` – catalogue ingestion and caching.
- `app/api/redeem/route.ts`, `components/CatalogueGrid.tsx` – redemption submission path.
- `app/api/stripe/checkout/route.ts`, `components/BuyPointsButton.tsx` – points purchase flow.
- `app/api/loyalty/route.ts`, `lib/supabaseLoyalty.ts` – loyalty ledger API & Supabase access layer.
- `app/api/cron/warm-catalogue/route.ts` – background cache warmer.
- `app/api/damac/redemption/route.ts`, `lib/damac.ts` – Damac code verification.
- `app/api/receipts/route.ts` – receipt generation & Airtable sync.
- `supabase/migrations/*.sql` – schema & analytics functions underpinning Supabase data.

## 13. Operational Considerations
- Maintain env secrets for Airtable, Supabase, Stripe, KV, and cron hooks before deploying.
- Monitor Sentry for upstream failures (Airtable rate limits, Supabase errors, Stripe issues).
- Ensure cron authentication is enforced for cache warmers in production.
- Keep Airtable catalogue within pagination guard thresholds or extend guard to cover expected record counts.

