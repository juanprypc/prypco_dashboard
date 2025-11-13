# DAMAC Islands 2 – Token Redemption Flow

This document captures how the bespoke DAMAC Islands 2 token experience works today. It covers the front-end journey, key components, API contracts, data sources, and known constraints so future contributors can reason about changes without re-reading the entire codebase.

## 1. End-to-End Journey

1. **Catalogue entry** – Items coming from Airtable with `damacIslandCampaign = true` are rendered in `components/CatalogueGrid.tsx`. Their CTA label is forced to “View availability” and stays enabled even when the catalogue status is `coming_soon`, ensuring agents can always launch the DAMAC flow (`components/CatalogueGrid.tsx:17-115`).
2. **Terms & Conditions** – `components/DashboardClient.tsx` still enforces the product-specific T&C gate. When the CTA is pressed, `handleRequestRedeem` opens `TermsDialog` (if `termsActive` is true) before any DAMAC UI is shown (`components/DashboardClient.tsx:440-490`).
3. **DAMAC modal** – After T&C acceptance, `startRedeemFlow` detects the DAMAC flag and opens the dedicated modal by populating `damacRedeemItem`. A full-screen overlay renders the map selector, allocation summary, and Close / Back to store controls (`components/DashboardClient.tsx:369-460`, `1517-1594`).
4. **Map selection** – `DamacMapSelector` fetches allocations from `/api/damac/map`, shows availability overlays, filters (search, bedroom type), zoom/pan helpers, and highlights the current selection. Selecting a unit updates both `selectedAllocationId` (to persist selection) and the `damacSelectionDetails` preview in the modal header (`components/redeem/DamacMapSelector.tsx:6-360`, `components/DashboardClient.tsx:1522-1533`).
5. **LER warning → verification** – Tapping “Confirm LER” on the selector first reveals a warning (“submitting an invalid LER forfeits funds”), then POSTs to `/api/damac/ler/verify`. Success hides the form and enables the “Continue” button; failures show inline errors without leaving the screen (`components/redeem/DamacMapSelector.tsx:280-340`).
6. **Points sufficiency branch** – The selector calls `onRequestProceed({ allocation, lerCode })`. `DashboardClient.handleDamacProceed` looks up the matching Airtable allocation record, computes the points requirement, and compares it to the agent’s balance:
   - **Enough points** – `/api/redeem` is invoked with the allocation metadata + `damacLerReference`. Success flips the modal into the “Request received” state and locks the token (`components/DashboardClient.tsx:945-1020`, `1517-1594`, `app/api/redeem/route.ts:1-86`).
   - **Insufficient points** – The flow jumps to the existing Stripe checkout helper (`startStripeCheckout`), with the shortfall converted into AED based on `pointsPerAed` and `minTopup` (`components/DashboardClient.tsx:959-987`).
7. **Webhook persistence** – `/api/redeem` packages all details and POSTs them to `AIRTABLE_REDEEM_WEBHOOK`. Downstream automations (outside this repo) record the redemption, including the `damacLerReference`, so subsequent LER verification requests will be blocked.

## 2. Front-End Components

### 2.1 `components/CatalogueGrid.tsx`
- Reads `damacIslandCampaign` from each catalogue record (propagated from `lib/airtable.ts:64-160`).
- Forces the CTA label to “View availability” and bypasses disablement so the DAMAC path can be triggered even when the badge says “Coming soon”.
- Emits `onRedeem(item)` so the dashboard layer can decide which modal to show.

### 2.2 `components/DashboardClient.tsx`
Key responsibilities for the DAMAC path:
- **State orchestration** – `damacRedeemItem`, `damacSelectedAllocationId`, `damacSelectionDetails`, `damacFlowStatus`, `damacFlowError`, and `damacConfirmedLer` drive the modal visuals and success overlay.
- **Entry point** – `startRedeemFlow` short-circuits to the DAMAC modal whenever `item.damacIslandCampaign` is true; otherwise it falls back to the legacy allocation picker / buyer verification.
- **Selection tracking** – The modal header reflects whichever allocation the selector reports through `onSelectionChange`.
- **Proceed handler** – `handleDamacProceed` receives the verified allocation/LER pair, performs balance checks, invokes Stripe when needed, or POSTs a redemption and transitions the modal into the success screen.
- **Stripe fallback** – Uses the existing `startStripeCheckout` helper, so the payment experience stays in sync with other catalogue items.

### 2.3 `components/redeem/DamacMapSelector.tsx`
- **Data fetch** – `useEffect` requests `/api/damac/map?catalogueId=...` to populate available units (ID, label, bedroom type, availability, price/points, area figures).
- **Interaction model** – Custom zoom/pan logic with scroll/touch gestures, filters, and search. Selected units are stored via `selectedAllocationId` + `onSelectionChange`.
- **Viewer counter** – Session-based pseudo-random “agents viewing now” badge to reinforce urgency.
- **LER flow** – `lerDigits` accepts numeric input only; `handleVerifyLer` reveals a warning before POSTing to `/api/damac/ler/verify`. Success stores the normalized code and invokes `onRequestProceed`.
- **Error states** – Inline callouts cover fetch failures, verification errors, and network issues. Button states disable interactions while requests are in flight.
- **Exports** – The component exports `AllocationWithStatus` (id, availability, metadata) so the dashboard can re-use a typed shape when performing balance math.

### 2.4 Supporting UI
- **`TermsDialog`** (`components/redeem/TermsDialog.tsx`) is unchanged but still part of the journey when the DAMAC reward has active T&C content.
- **Success overlay** (inside `DashboardClient`) presents the confirmation state and “Back to store” CTA once `/api/redeem` resolves.

## 3. Backend & API Contracts

| Endpoint | Purpose | Implementation Notes |
| --- | --- | --- |
| `GET /api/damac/map` | Returns all unit allocations (optionally filtered by `catalogueId`) with basic availability flags. | Wraps `fetchLoyaltyCatalogue()` (`lib/airtable.ts`) and exposes only the fields the selector needs (`app/api/damac/map/route.ts:1-80`). Caches for 30s using `Cache-Control`. |
| `POST /api/damac/ler/verify` | Validates that an LER hasn’t been used before. | Normalizes the code, queries Airtable via `fetchDamacRedemptionByCode`, and responds with `{ ok: true }` or `{ ok: false, reason, message }`. Basic Auth was explicitly bypassed for this route in `middleware.ts` so Safari no longer shows a login prompt (`middleware.ts:1-44`). |
| `POST /api/redeem` | Submits a confirmed redemption to Airtable via webhook. | Accepts the `damacLerReference` field; when present, buyer verification requirements are skipped. Payload includes allocation identifiers so downstream automation can mark the specific unit as locked (`app/api/redeem/route.ts:1-86`). |
| `POST /api/stripe/checkout` | (Existing) fallback when the agent lacks sufficient points. | `handleDamacProceed` feeds it the AED shortfall so the flow matches the standard “buy points” path. |

## 4. Data & Environment Dependencies

- **Catalogue source** – `lib/airtable.fetchLoyaltyCatalogue` augments each `CatalogueDisplayItem` with `damacIslandCampaign`, allocation metadata, and T&C details. The DAMAC flow assumes the DAMAC token record has active allocations in Airtable (table names from `AIRTABLE_TABLE_UNIT_ALLOCATIONS` and `AIRTABLE_TABLE_LOY`).
- **Redemption lookups** – `/api/damac/ler/verify` depends on `AIRTABLE_API_KEY`, `AIRTABLE_BASE`, and `AIRTABLE_TABLE_LOY` to query the `loyalty_redemption` table for existing LER codes.
- **Webhook** – `/api/redeem` requires `AIRTABLE_REDEEM_WEBHOOK`; failing to set it returns a 500 (“Webhook not configured”).
- **Auth** – Middleware keeps `/damac*` and `/api/damac/*` behind HTTP Basic Auth *except* for `/api/damac/map` and `/api/damac/ler/*`, which need to be publicly callable from the dashboard session.

## 5. Error Handling & Edge Cases

- **Allocation mismatch** – If the selector’s allocation ID no longer exists in the catalogue snapshot (e.g., stock changes mid-session), `handleDamacProceed` surfaces “Selected unit is no longer available” and forces the agent to pick again (`components/DashboardClient.tsx:947-958`).
- **Missing points metadata** – Redemptions without a points value are blocked client-side to avoid sending incomplete payloads.
- **LER collisions** – The verification endpoint rejects any LER already stored in `loyalty_redemption`. However, there’s still a race window between verification and webhook persistence; two agents entering the same LER simultaneously could both pass verification if the first redemption hasn’t been saved yet.
- **Network failures** – Selector fetch failures show a card-level error with a “Try again” CTA; verification errors return to the form without leaving the modal.
- **Stripe path** – If Stripe checkout initiation fails, the error is displayed inline inside the modal and the flow resets to `idle`.

## 6. Future Considerations

- **Atomic LER locking** – Consider persisting a “pending” LER record (or using Airtable automation) as soon as verification succeeds to close the race condition described above.
- **Lint clean-up** – The selector still uses a raw `<img>` (line 851), triggering `@next/next/no-img-element` warnings on build. Switching to `next/image` keeps CI green.
- **Testing** – The entire flow currently relies on manual QA. Adding unit tests around `/api/damac/ler/verify` and integration tests for `handleDamacProceed` would catch regressions faster.
- **Analytics** – If conversion tracking is needed, instrument the “LER verified” and “Request received” states before rolling out broadly.

This documentation should serve as the primary reference when modifying the DAMAC Islands 2 – Token flow. Update it whenever new branches, validation rules, or external dependencies are introduced.
