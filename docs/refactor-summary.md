# Redemption Refactor Summary (Jan 2025)

## 1. DashboardClient Decomposition
- Extracted `DamacRedemptionFlow`, `TokenRedemptionFlow`, and `SimpleRedemptionFlow` into `components/redeem/flows/`.
- `DashboardClient.tsx` now only orchestrates ledger/catalogue views and decides which flow to mount.
- All DAMAC-specific state (insufficient balance modal, auto-restore) lives inside `DamacRedemptionFlow`.

## 2. Shared Terms & Context
- Added `RedemptionProvider` (`components/redeem/context/RedemptionContext.tsx`).
- Provider tracks accepted terms, renders `TermsDialog`, and exposes `hasAcceptedTerms`, `showTermsDialog`, and `requireTermsAcceptance`.
- Dashboard no longer keeps any `terms*` state; flows consume the context.

## 3. Buyer Verification Hook
- Added `useBuyerVerification` (`components/redeem/hooks/useBuyerVerification.ts`).
- Token/Simple flows now reuse this hook for buyer verification instead of duplicating state.
- Token flow hides the unit allocation dialog while verification is active to avoid UX regression.

## 4. Automated Testing
- Added Vitest + Testing Library setup (`vitest.config.ts`, `vitest.setup.ts`).
- Smoke tests:
  - `components/redeem/context/__tests__/RedemptionContext.test.tsx`
  - `components/redeem/flows/__tests__/SimpleRedemptionFlow.test.tsx`
  - `components/redeem/flows/__tests__/TokenRedemptionFlow.test.tsx`
- `npm run test` now runs these suites.

## 5. Tooling & Config
- Updated `postcss.config.mjs` to skip Tailwind during Vitest runs.
- Added new testing dependencies in `package.json`.
- `npm run lint` and `npm run build` remain the verification commands (with existing Damac `<img>` warning).

## 6. Documentation
- `docs/technical-debt-dashboard-refactoring.md` updated with:
  - Execution blueprint + progress markers for Phase 3.
  - Current line counts (DashboardClient ~1.4k, flows 400/179/136).
  - Noted automated tests + remaining TODOs (DamacMapSelector split, shared analytics).

## 7. Outstanding Tasks
- Break `DamacMapSelector.tsx` into controller + presentational pieces.
- Consolidate shared DAMAC analytics helpers (not yet extracted).
- Optional: add DAMAC flow RTL test + integration coverage once map split is done.
