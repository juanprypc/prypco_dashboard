# Dashboard Component Architecture: Technical Debt & Refactoring Plan

**Status:** 🔴 High Technical Debt
**Priority:** Post-Launch (Do NOT refactor before go-live)
**Created:** 2025-01-14
**Last Updated:** 2025-01-14

---

## Executive Summary

The `DashboardClient.tsx` component has grown to **1,900+ lines** and has become a "God Component" that handles:
- Dashboard display (appropriate)
- Catalogue grid (appropriate)
- **ALL redemption flows** (inappropriate - should be extracted)
  - DAMAC Islands token redemption (~400 lines)
  - Generic token redemption with unit allocation (~200 lines)
  - Simple reward redemption (~150 lines)
  - Terms & Conditions flow (~50 lines)
  - Buyer verification flow (~50 lines)

**Impact:**
- Hard to navigate and understand
- Difficult to review PRs (too many changes in one file)
- High cognitive load for new developers
- Tight coupling makes testing difficult
- Risk of breaking unrelated features when making changes

**Recommendation:** Refactor **after** successful go-live, following incremental approach over 2-3 weeks.

---

## Current Architecture (The Mess)

### File Structure Today

```
components/
├── DashboardClient.tsx (1,900 lines) 😱 PROBLEM
│   ├── Loyalty ledger display
│   ├── Catalogue grid
│   ├── Navigation tabs
│   ├── Top-up flow
│   ├── Referral cards
│   └── ALL REDEMPTION FLOWS:
│       ├── DAMAC Islands redemption (full flow)
│       ├── Generic token redemption (full flow)
│       ├── Simple reward redemption (full flow)
│       ├── Terms & Conditions (full flow)
│       └── Buyer verification (full flow)
│
└── redeem/
    ├── DamacMapSelector.tsx (map UI only)
    ├── RedeemDialog.tsx (simple redemption modal)
    ├── TermsDialog.tsx (T&C modal)
    ├── UnitAllocationDialog.tsx (unit picker modal)
    └── BuyerVerificationDialog.tsx (buyer info collection)
```

### Component Responsibility Matrix

| Component | Current Responsibilities | Lines | Should Be |
|-----------|-------------------------|-------|-----------|
| `DashboardClient.tsx` | Everything | 1,900 | 600-800 |
| `DamacMapSelector.tsx` | Just map UI | 1,200 | ✅ OK |
| `RedeemDialog.tsx` | Modal UI only | ~100 | ✅ OK |
| `TermsDialog.tsx` | Modal UI only | ~100 | ✅ OK |
| Other dialogs | Modal UI only | ~100 each | ✅ OK |

**Problem:** All orchestration logic lives in DashboardClient instead of dedicated flow components.

---

## Detailed Problem Analysis

### 1. DAMAC Islands Redemption (~400 lines in DashboardClient)

**State Management (9 pieces of state):**
```typescript
const [damacRedeemItem, setDamacRedeemItem] = useState(...)
const [damacSelectedAllocationId, setDamacSelectedAllocationId] = useState(...)
const [damacSelectionDetails, setDamacSelectionDetails] = useState(...)
const [damacFlowStatus, setDamacFlowStatus] = useState(...)
const [damacFlowError, setDamacFlowError] = useState(...)
const [damacConfirmedLer, setDamacConfirmedLer] = useState(...)
const [damacPendingSubmission, setDamacPendingSubmission] = useState(...)
const [damacInsufficientBalanceModal, setDamacInsufficientBalanceModal] = useState(...)
```

**Business Logic Functions:**
- `handleDamacProceed()` - LER verification callback
- `submitDamacRedemption()` - Final submission
- `handleBuyPointsForDamac()` - Stripe checkout for insufficient balance
- `closeDamacInsufficientBalanceModal()` - Modal close handler
- `cancelDamacPendingSubmission()` - Cancel confirmation
- `closeDamacFlow()` - Exit entire flow

**UI Rendering:**
- DAMAC modal wrapper (lines 1649-1787)
- Map selector (DamacMapSelector component)
- Confirmation screen (lines 1719-1776)
- Success screen (lines 1678-1706)
- Insufficient balance modal (lines 1789-1845)
- Processing overlay (lines 1780-1784)

**Auto-Restore Logic:**
- useEffect for URL parameter restoration (lines 1177-1198)

**Why This Is Wrong:**
- DAMAC-specific logic mixed with general dashboard code
- Hard to test DAMAC flow in isolation
- Changes to DAMAC require touching 1900-line file
- No clear boundaries between DAMAC and other features

### 2. Generic Token Redemption (~200 lines in DashboardClient)

**State Management:**
```typescript
const [unitAllocationDialogItem, setUnitAllocationDialogItem] = useState(...)
const [unitAllocationSelection, setUnitAllocationSelection] = useState(...)
const [selectedUnitAllocation, setSelectedUnitAllocation] = useState(...)
const [redeemItem, setRedeemItem] = useState(...)
const [redeemStatus, setRedeemStatus] = useState(...)
const [redeemMessage, setRedeemMessage] = useState(...)
```

**Business Logic:**
- `startRedeemFlow()` - Entry point for all redemptions
- `confirmUnitAllocation()` - Unit selection handler
- `closeUnitAllocationDialog()` - Dialog close
- `beginRedeem()` - Start actual redemption
- `handleRedeemSubmit()` - Final submission

**UI Rendering:**
- Unit allocation dialog (lines 1848-1856)
- Standard redeem dialog (lines 1867+)

### 3. Simple Reward Redemption (~150 lines in DashboardClient)

Same state as generic token, but simpler flow (no unit selection).

### 4. Terms & Conditions (~50 lines in DashboardClient)

**State:**
```typescript
const [termsDialogItem, setTermsDialogItem] = useState(...)
const [termsDialogMode, setTermsDialogMode] = useState(...)
const [termsAcceptedItemId, setTermsAcceptedItemId] = useState(...)
```

### 5. Buyer Verification (~50 lines in DashboardClient)

**State:**
```typescript
const [buyerVerificationDialogItem, setBuyerVerificationDialogItem] = useState(...)
const [buyerVerificationAllocation, setBuyerVerificationAllocation] = useState(...)
const [preFilledBuyerDetails, setPreFilledBuyerDetails] = useState(...)
```

---

## Proposed Architecture (The Fix)

### Target File Structure

```
components/
├── DashboardClient.tsx (~600-800 lines) ✅
│   ├── Loyalty ledger display
│   ├── Catalogue grid
│   ├── Navigation tabs
│   ├── Top-up flow
│   ├── Referral cards
│   └── Redemption orchestrator (just decides which flow to open)
│
└── redeem/
    ├── flows/
    │   ├── DamacRedemptionFlow.tsx (~400 lines) ✨ NEW
    │   │   ├── All DAMAC state
    │   │   ├── All DAMAC business logic
    │   │   ├── Insufficient balance modal
    │   │   ├── Confirmation screen
    │   │   └── Success screen
    │   │
    │   ├── TokenRedemptionFlow.tsx (~200 lines) ✨ NEW
    │   │   ├── Unit allocation state
    │   │   ├── Unit selection logic
    │   │   └── Redemption submission
    │   │
    │   └── SimpleRedemptionFlow.tsx (~150 lines) ✨ NEW
    │       ├── Simple reward state
    │       └── Direct redemption logic
    │
    ├── components/
    │   ├── DamacMapSelector.tsx (existing, unchanged)
    │   ├── DamacInsufficientBalanceModal.tsx ✨ NEW
    │   ├── RedeemDialog.tsx (existing, unchanged)
    │   ├── TermsDialog.tsx (existing, unchanged)
    │   ├── UnitAllocationDialog.tsx (existing, unchanged)
    │   └── BuyerVerificationDialog.tsx (existing, unchanged)
    │
    └── index.ts (exports)
```

### Component Responsibility Matrix (After Refactor)

| Component | Responsibilities | Lines | Status |
|-----------|-----------------|-------|---------|
| `DashboardClient.tsx` | Dashboard, catalogue, orchestration | 600-800 | ✅ Clean |
| `DamacRedemptionFlow.tsx` | DAMAC flow only | ~400 | ✨ New |
| `TokenRedemptionFlow.tsx` | Token flow only | ~200 | ✨ New |
| `SimpleRedemptionFlow.tsx` | Simple reward flow | ~150 | ✨ New |
| Modal components | UI only, no logic | ~100 each | ✅ OK |

---

## Execution Blueprint (Ready for Implementation)

This section translates the high-level concept into concrete steps so we can start coding immediately after go-live.

### Pre-flight Checklist (Day 0-1 after launch)
- Confirm no blocking bugs in production dashboard.
- Capture current DAMAC analytics (submission rate, Stripe fallbacks) to compare post-refactor.
- Freeze catalogue schema changes until Phase 1 completes.
- Create feature branch `refactor/dashboard-redemption`.
- Turn on additional Sentry breadcrumbs for `/api/redeem` to aid regression triage.

### Shared Conventions to Adopt Before Coding
1. **Flow Container API** – every flow component (`DamacRedemptionFlow`, `TokenRedemptionFlow`, `SimpleRedemptionFlow`) receives the same minimal prop shape:
   ```ts
   type RedemptionFlowProps = {
     item: CatalogueDisplayItem;
     agentId?: string;
     agentCode?: string;
     availablePoints: number;
     minTopup: number;
     pointsPerAed: number;
     formatAedFull: (value?: number | null) => string;
     startStripeCheckout: typeof startStripeCheckout;
     onClose: () => void;
     onSuccess?: () => void;
   };
   ```
   Each flow can extend this for its specific needs (e.g., DAMAC auto-restore params).
2. **Redemption Context (optional but recommended)** – introduce `RedeemFlowContext` (React context) to hold `preFilledBuyerDetails`, `termsAcceptedItemId`, and analytics helpers so the extracted flows don’t keep drilling props from `DashboardClient`.
3. **Test Harness** – add a lightweight `__tests__/flows/` folder with React Testing Library smoke tests that render each flow using mocked props to ensure key states still render after extraction.

### Phase 1 Detailed Tasks – DAMAC Flow (Target week 1)
1. **Create Flow Shell**
   - Add `components/redeem/flows/DamacRedemptionFlow.tsx`.
   - Define `DamacRedemptionFlowProps` that extend `RedemptionFlowProps` with `autoSelectAllocationId`, `autoVerifiedLerCode`, and `onForceRefresh` (to set `forceFreshLoyalty`).
   - Move all `damac*` state hooks from `DashboardClient.tsx` into the new component.
2. **Move Business Logic**
   - Relocate `handleDamacProceed`, `submitDamacRedemption`, `handleBuyPointsForDamac`, `closeDamacInsufficientBalanceModal`, `cancelDamacPendingSubmission`, and `closeDamacFlow`.
   - Hoist helper functions (e.g., `normaliseTopupAmount`) into `lib/redeem.ts` if shared; otherwise keep local to the flow.
3. **Extract Insufficient Balance Modal**
   - Create `components/redeem/components/DamacInsufficientBalanceModal.tsx`.
   - The flow component owns the modal’s open/close state, so `DashboardClient` is unaware of the modal after the move.
4. **Migrate Auto-Restore Effects**
   - Move the `useEffect` that watches `autoOpenRewardId/autoSelectAllocationId/autoVerifiedLerCode` into the flow.
   - Ensure Stripe return parameters are read from props so DashboardClient only passes search-param values once.
5. **Wire Back into DashboardClient**
   - Replace DAMAC JSX block with:
     ```tsx
     {damacRedeemItem ? (
       <DamacRedemptionFlow
         item={damacRedeemItem}
         agentId={agentId}
         agentCode={agentCode}
         availablePoints={metrics.totalPosted}
         minTopup={minTopup}
         pointsPerAed={pointsPerAed}
         formatAedFull={formatAedFull}
         startStripeCheckout={startStripeCheckout}
         autoSelectAllocationId={autoSelectAllocationId}
         autoVerifiedLerCode={autoVerifiedLerCode}
         onClose={() => setDamacRedeemItem(null)}
         onSuccess={() => setForceFreshLoyalty(true)}
       />
     ) : null}
     ```
6. **Regression Testing**
   - Manual paths outlined in “Testing Strategy”.
   - Add Jest/RTL smoke test: renders flow, triggers `handleDamacProceed` with insufficient points, expects modal.
   - Cypress (optional) scenario: start DAMAC redemption, perform Stripe redirect simulation.
7. **Deployment**
   - Merge to staging mid-week, run smoke tests, then deploy during low-traffic window with rollback plan ready.

### Phase 2 Detailed Tasks – Token & Simple Flows (Target week 2-3)
1. **Token Flow**
   - File: `components/redeem/flows/TokenRedemptionFlow.tsx`.
   - Move `unitAllocationDialogItem`, `unitAllocationSelection`, `confirmUnitAllocation`, `closeUnitAllocationDialog`, and `beginRedeem` logic for token-specific paths.
   - Flow receives callbacks: `onRequestBuyerVerification`, `onRequestTerms`, `onOpenRedeemDialog`.
2. **Simple Flow**
   - File: `components/redeem/flows/SimpleRedemptionFlow.tsx`.
   - Owns `redeemItem`, `redeemStatus`, `redeemMessage`, and submission handler currently embedded in `RedeemDialog`.
   - Consider abstracting API call into `lib/redeem.ts` so both token and simple flows reuse it.
3. **Shared Hooks**
   - Add `useTermsGate` and `useBuyerVerification` hooks under `components/redeem/hooks/` to share logic now duplicated in DashboardClient.
4. **DashboardClient Simplification**
   - Reduce DashboardClient to:
     - Render ledger/catalogue.
     - Track “which flow is active” via simple enums.
     - Provide shared props/context.
5. **Testing**
   - Component tests for token flow (unit selection, buyer verification fallback, success state).
   - Regression manual tests for simple rewards.

### Phase 3 Detailed Tasks – Shared Utilities & Map Follow-up (Target month 2)
1. **Shared Terms & Buyer Verification**
   - Implement the `shared` flow components listed earlier and migrate Token/Simple flows to use them.
2. **DamacMapSelector Split**
   - Break `components/redeem/DamacMapSelector.tsx` into:
     - `DamacMapSelector.tsx` (presentation only).
     - `useDamacMapController.ts` (state machine: zoom, filters, LER validation).
     - Optional `components/redeem/map/` directory for legend, HUD, etc.
3. **State Management (Optional)**
   - Evaluate Zustand/Jotai store for redemption flows if prop drilling remains high after extraction.
4. **Documentation & Analytics**
   - Update `docs/technical-debt-dashboard-refactoring.md` success metrics with actual numbers post-refactor.
   - Compare DAMAC bug counts and PR review times before vs. after.

### Definition of Done
- DashboardClient under 800 lines, no redemption-specific hooks.
- Each flow component independently testable and owns its side effects.
- Automated smoke tests cover at least DAMAC insufficient-balance path and standard redeem success path.
- Rollback instructions verified and documented per release.

With this blueprint we can transition from planning to execution immediately after launch without re-negotiating scope.

---

## Refactoring Plan

### ⚠️ CRITICAL: Timing

**DO NOT START BEFORE:**
- ✅ Successful go-live on Monday
- ✅ 1 week of monitoring production (no critical bugs)
- ✅ Product team approval for code freeze window

**EARLIEST START DATE:** Week of January 20, 2025

---

### Phase 1: Extract DAMAC Flow (Priority 1)

**Timeline:** 1 week
**Effort:** 6-8 hours
**Risk:** Medium
**Impact:** High (biggest file, most complex)

#### Step 1.1: Create DamacInsufficientBalanceModal Component (2 hours)

**What to do:**
1. Create `components/redeem/components/DamacInsufficientBalanceModal.tsx`
2. Copy modal JSX from DashboardClient (lines 1789-1845)
3. Define props interface:
```typescript
type Props = {
  requiredPoints: number;
  availablePoints: number;
  shortfall: number;
  suggestedAed: number;
  pointsPerAed: number;
  isSubmitting: boolean;
  onBuyPoints: () => void;
  onGoBack: () => void;
};
```
4. Update DashboardClient to use new component
5. Test modal functionality (open, buy points, go back)
6. Commit: "refactor: extract DamacInsufficientBalanceModal component"

**Files Changed:**
- ✨ Create: `components/redeem/components/DamacInsufficientBalanceModal.tsx`
- ✏️ Modify: `components/DashboardClient.tsx` (-60 lines)
- ✏️ Modify: `components/redeem/index.ts` (add export)

**Testing Checklist:**
- [ ] Modal opens when insufficient balance
- [ ] "Buy Points" redirects to Stripe with context
- [ ] "Go Back" closes modal and shows map selector
- [ ] Styling matches current design
- [ ] Loading state works during Stripe redirect

**Risk Mitigation:**
- Small, isolated change
- Easy to revert if issues found
- No business logic changes

---

#### Step 1.2: Create DamacRedemptionFlow Component (4-6 hours)

**What to do:**
1. Create `components/redeem/flows/DamacRedemptionFlow.tsx`
2. Move all `damac*` state from DashboardClient
3. Move all `handleDamac*`, `submitDamac*`, `closeDamac*` functions
4. Move DAMAC modal JSX (lines 1649-1787)
5. Move auto-restore useEffect (lines 1177-1198)
6. Update DashboardClient to render new component:
```typescript
{damacRedeemItem && (
  <DamacRedemptionFlow
    item={damacRedeemItem}
    agentId={agentId}
    agentCode={agentCode}
    metrics={metrics}
    startStripeCheckout={startStripeCheckout}
    formatAedFull={formatAedFull}
    minTopup={minTopup}
    pointsPerAed={pointsPerAed}
    autoSelectAllocationId={autoSelectAllocationId}
    autoVerifiedLerCode={autoVerifiedLerCode}
    onClose={() => setDamacRedeemItem(null)}
    onSuccess={() => {
      setForceFreshLoyalty(true);
      setDamacRedeemItem(null);
    }}
  />
)}
```

**Files Changed:**
- ✨ Create: `components/redeem/flows/DamacRedemptionFlow.tsx` (+450 lines)
- ✏️ Modify: `components/DashboardClient.tsx` (-400 lines)
- ✏️ Modify: `components/redeem/index.ts` (add export)

**Testing Checklist:**
- [ ] Full DAMAC flow works (sufficient balance)
- [ ] Insufficient balance → modal → Stripe → return → confirmation
- [ ] LER verification works
- [ ] Unit selection works
- [ ] Confirmation screen displays correctly
- [ ] Success screen works
- [ ] Error handling works
- [ ] Close button works at all stages
- [ ] Auto-restore after Stripe payment works
- [ ] Cancel Stripe → return works
- [ ] Mobile responsive

**Risk Mitigation:**
- Test thoroughly in staging
- Deploy during low-traffic window
- Have rollback plan ready
- Monitor Sentry for errors
- Keep original code in git history

**Rollback Plan:**
```bash
# If issues found:
git revert <commit-hash>
git push origin staging
# Deploy rollback to production
```

---

### Phase 2: Extract Token & Simple Flows (Priority 2)

**Timeline:** 1 week
**Effort:** 4-6 hours
**Risk:** Low
**Impact:** Medium

#### Step 2.1: Create TokenRedemptionFlow Component (3 hours)

**What to do:**
1. Create `components/redeem/flows/TokenRedemptionFlow.tsx`
2. Move unit allocation state
3. Move `confirmUnitAllocation`, `beginRedeem` logic
4. Move unit allocation dialog rendering
5. Update DashboardClient

**Files Changed:**
- ✨ Create: `components/redeem/flows/TokenRedemptionFlow.tsx` (+250 lines)
- ✏️ Modify: `components/DashboardClient.tsx` (-200 lines)

#### Step 2.2: Create SimpleRedemptionFlow Component (2 hours)

**What to do:**
1. Create `components/redeem/flows/SimpleRedemptionFlow.tsx`
2. Move simple redemption state
3. Move `handleRedeemSubmit` logic
4. Move redeem dialog rendering
5. Update DashboardClient

**Files Changed:**
- ✨ Create: `components/redeem/flows/SimpleRedemptionFlow.tsx` (+180 lines)
- ✏️ Modify: `components/DashboardClient.tsx` (-150 lines)

---

### Phase 3: Consolidate Shared Logic (Priority 3)

**Timeline:** 3 days
**Effort:** 3-4 hours
**Risk:** Low
**Impact:** Low (quality of life)

**What to do:**
1. Extract shared Terms & Conditions flow
2. Extract shared Buyer Verification flow
3. Create shared types file
4. Create shared utilities

**Files Changed:**
- ✨ Create: `components/redeem/flows/shared/TermsFlow.tsx`
- ✨ Create: `components/redeem/flows/shared/BuyerVerificationFlow.tsx`
- ✨ Create: `components/redeem/types.ts`
- ✏️ Modify: All flow components to use shared flows

---

## Risk Assessment

### High Risk Items

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking DAMAC flow | Medium | High | Comprehensive testing checklist |
| Breaking auto-restore | Low | High | Test Stripe round-trip thoroughly |
| TypeScript errors | High | Low | Fix incrementally, use strict mode |
| State management issues | Medium | Medium | Careful prop drilling, consider context |
| CSS/styling breaks | Low | Low | Keep z-index values, test visually |

### Medium Risk Items

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Props drilling hell | High | Medium | Keep shallow hierarchy, use composition |
| Test coverage gaps | Medium | Medium | Manual testing + smoke tests |
| Merge conflicts | Medium | Low | Small, frequent commits |
| Performance regression | Low | Low | Profile before/after |

---

## Success Metrics

### Before Refactor

- **Lines in DashboardClient:** 1,900
- **Number of useState calls:** ~30
- **Number of useCallback calls:** ~25
- **Cyclomatic complexity:** Very High
- **PR review time:** 30-60 minutes
- **Time to understand DAMAC flow:** 60+ minutes

### After Refactor (Target)

- **Lines in DashboardClient:** 600-800 (-1,100 lines)
- **Lines in DamacRedemptionFlow:** ~400
- **Lines in TokenRedemptionFlow:** ~200
- **Lines in SimpleRedemptionFlow:** ~150
- **Cyclomatic complexity:** Medium (each file)
- **PR review time:** 15-20 minutes
- **Time to understand DAMAC flow:** 20 minutes

---

## Testing Strategy

### Phase 1 Testing (DAMAC)

**Manual Testing:**
1. ✅ Sufficient balance path
   - [ ] Select unit from map
   - [ ] Enter LER
   - [ ] Verify confirmation screen shows
   - [ ] Submit redemption
   - [ ] See success screen
   - [ ] Return to catalogue

2. ✅ Insufficient balance path
   - [ ] Select unit from map
   - [ ] Enter LER
   - [ ] See insufficient balance modal
   - [ ] Click "Buy Points"
   - [ ] Complete Stripe payment
   - [ ] Return to confirmation screen (auto-restored)
   - [ ] Submit redemption
   - [ ] See success screen

3. ✅ Cancel payment path
   - [ ] Select unit → LER → insufficient balance
   - [ ] Click "Buy Points" → Stripe
   - [ ] Cancel Stripe payment
   - [ ] Return to confirmation screen
   - [ ] Can still submit if balance now sufficient

4. ✅ Error handling
   - [ ] Invalid LER
   - [ ] Already redeemed LER
   - [ ] API errors
   - [ ] Network errors

5. ✅ Edge cases
   - [ ] Close modal at various stages
   - [ ] Change selection after LER verify
   - [ ] Browser back button
   - [ ] Multiple tabs open

**Automated Testing (Optional):**
- Component tests for DamacRedemptionFlow
- Integration tests for full flow
- Snapshot tests for UI

### Phase 2 & 3 Testing

Similar approach for token and simple redemption flows.

---

## Rollback Strategy

### If Issues Found in Production

**Immediate (< 5 minutes):**
```bash
# Revert the deployment
git revert <commit-hash>
git push origin main
# Deploy via Vercel/hosting platform
```

**Within 1 hour:**
- Notify team via Slack
- Create incident report
- Review Sentry errors
- Decide: fix forward or stay on rollback

**Within 24 hours:**
- Root cause analysis
- Fix issues in branch
- Re-test thoroughly
- Re-deploy when confident

### Monitoring Checklist

**First 24 hours after deployment:**
- [ ] Check Sentry for new errors
- [ ] Monitor redemption success rate
- [ ] Check user support tickets
- [ ] Verify DAMAC submissions in Airtable
- [ ] Test manually in production

**First week:**
- [ ] Daily Sentry check
- [ ] Weekly support ticket review
- [ ] Compare metrics to pre-refactor baseline

---

## Cost-Benefit Analysis

### Costs

| Item | Time | Risk | Priority |
|------|------|------|----------|
| Phase 1: DAMAC extraction | 6-8 hours | Medium | High |
| Phase 2: Token/Simple extraction | 4-6 hours | Low | Medium |
| Phase 3: Shared logic | 3-4 hours | Low | Low |
| Testing & QA | 4-6 hours | - | High |
| Documentation updates | 2 hours | - | Medium |
| **Total** | **19-26 hours** | | |

### Benefits

**Short-term (Weeks 1-4):**
- Easier to review PRs (smaller diffs)
- Faster to locate bugs (clear boundaries)
- Less cognitive load when making changes

**Medium-term (Months 2-6):**
- New features easier to add
- Less fear of breaking things
- Better onboarding for new developers

**Long-term (6+ months):**
- Maintainable codebase
- Can add new redemption types easily
- Technical debt reduced significantly

### Break-Even Analysis

**Assumptions:**
- Average time to make DAMAC change today: 2 hours (navigating 1900-line file)
- Average time to make DAMAC change after refactor: 1 hour (focused file)
- Frequency: 2 DAMAC changes per month

**Break-even point:** After ~8-10 DAMAC feature additions (4-5 months)

**Verdict:** Worth it if you plan to add more DAMAC features. If DAMAC is "done", lower priority.

---

## Decision Framework

### When to Refactor?

**YES, do Phase 1 (DAMAC) if:**
- ✅ You plan to add more DAMAC features in next 6 months
- ✅ Team struggles to review DAMAC PRs
- ✅ Bugs are frequently found in DAMAC flow
- ✅ New developers need to understand DAMAC
- ✅ You have 1-2 weeks of development capacity

**NO, skip for now if:**
- ❌ DAMAC is stable and complete
- ❌ No capacity for 1-2 weeks of work
- ❌ Other critical features need attention
- ❌ Team is very small (1-2 devs)
- ❌ Go-live is within 2 weeks

### When to do Phase 2 & 3?

**Only after:**
- Phase 1 is complete and stable
- 2+ weeks have passed in production
- No critical bugs in DAMAC flow
- Team has bandwidth

---

## Recommendation

### Immediate (This Week)

**❌ DO NOT REFACTOR**
- Ship current code as-is
- Focus on go-live success
- Monitor for bugs

### Post-Launch (Week of Jan 20)

**✅ Assess situation:**
- Review go-live success
- Check bug reports
- Evaluate team bandwidth
- Decide on Phase 1 timing

### If Proceeding with Refactor

**Week 1 (Jan 20-26):**
- Extract DamacInsufficientBalanceModal (2 hours)
- Test thoroughly (2 hours)
- Deploy to staging
- Monitor

**Week 2 (Jan 27-Feb 2):**
- Extract DamacRedemptionFlow (6 hours)
- Test exhaustively (4 hours)
- Deploy to staging
- User acceptance testing
- Deploy to production (low-traffic window)
- Monitor closely for 48 hours

**Week 3-4 (Feb 3-16):**
- Pause, monitor, gather feedback
- If stable, proceed to Phase 2

**Month 2 (Feb-Mar):**
- Phase 2: Token & Simple flows (if needed)
- Phase 3: Shared logic consolidation (if valuable)

---

## Conclusion

The current `DashboardClient.tsx` architecture has significant technical debt that will impact long-term maintainability. However, **this is not an emergency** and should **not** block go-live.

**Recommended approach:**
1. ✅ Ship current code Monday
2. ✅ Monitor for 1-2 weeks
3. ✅ Assess refactor value based on roadmap
4. ✅ If proceeding, follow incremental approach
5. ✅ Test exhaustively at each phase

**Key principle:** "Working software over perfect architecture" - ship now, improve later.

---

## Appendix: File Size Reference

| File | Current Lines | After Phase 1 | After Phase 2-3 |
|------|--------------|---------------|-----------------|
| `DashboardClient.tsx` | 1,900 | 1,500 | 600-800 |
| `DamacRedemptionFlow.tsx` | - | 450 | 400 |
| `DamacInsufficientBalanceModal.tsx` | - | 70 | 70 |
| `TokenRedemptionFlow.tsx` | - | - | 200 |
| `SimpleRedemptionFlow.tsx` | - | - | 150 |
| **Total Lines** | 1,900 | 2,020 | 1,820 |

*Note: Total increases initially due to component boilerplate, but maintainability improves significantly.*

---

**Document Owner:** Development Team
**Last Review:** 2025-01-14
**Next Review:** After go-live (2025-01-20)
