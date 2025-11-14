# DAMAC Islands 2 Token Redemption Flow

Complete technical documentation for the DAMAC Islands 2 Token redemption experience. This document reflects the current implementation including all recent UX improvements, state management, balance validation, and Stripe integration.

## 1. End-to-End User Journey

### 1.1 Standard Flow (Sufficient Balance)

1. **Catalogue Entry** - User sees "DAMAC Islands 2 - Token" in catalogue with "View availability" button
2. **Terms & Conditions** - Modal shows T&C, user scrolls purple-highlighted text and accepts
3. **DAMAC Modal Opens** - Full-screen modal with map selector and unit information
4. **Unit Selection** - User browses interactive map, filters by bedroom type, searches units
5. **LER Verification** - User enters LER code, sees warning, verifies successfully
6. **Confirmation Screen** - Map selector is **completely replaced** by centered confirmation card showing:
   - Selected unit (e.g., DIBS1/SD331/G128X04)
   - Points required (e.g., 28,500)
   - Property price (AED 2,825,000)
   - Unit type/prototype
   - Verified LER code
   - "Change selection" and "Confirm & redeem" buttons
7. **Processing** - Brief "Processing your request..." overlay
8. **Success Screen** - Centered success message with checkmark icon, confirmation that LER is locked
9. **Back to Store** - Returns to catalogue, points deducted, balance refreshed

### 1.2 Insufficient Balance Flow

1. **Steps 1-5** - Same as standard flow through LER verification
2. **Balance Check** - After LER verification, system detects insufficient points
3. **Interstitial Modal** - User sees "Insufficient Points" modal with:
   - Warning icon with amber styling
   - Clear message: "You don't have enough points for this unit. Buy more points to continue with your redemption."
   - Breakdown showing:
     - Required points
     - Available points
     - Shortfall (how many more needed)
     - Suggested top-up amount
   - Two action buttons:
     - **"Buy Points"** (primary) - Proceeds to Stripe
     - **"Go Back"** (secondary) - Returns to map selector
4. **User Acknowledgment** - User must click "Buy Points" to continue (emphasizes loyalty ecosystem)
5. **Stripe Checkout** - Opens with calculated shortfall amount
6. **Payment Processing** - User completes payment on Stripe
7. **Return with Context** - Stripe redirects to: `/dashboard?topup=success&reward=recXXX&allocation=recYYY&ler=LER-12341`
8. **Auto-Restore State** - Dashboard automatically:
   - Opens DAMAC modal
   - Loads the exact unit user selected
   - Shows confirmation screen with verified LER
   - **No manual re-selection needed**
9. **Continue Flow** - User clicks "Confirm & redeem", completes redemption
10. **Success** - Same success screen as standard flow

### 1.3 Cancel Payment Flow

If user cancels Stripe payment:
- Redirects to: `/dashboard?topup=cancel&reward=recXXX&allocation=recYYY&ler=LER-12341`
- Same auto-restore behavior
- User can continue redemption or change selection

## 2. Component Architecture

### 2.1 `components/DashboardClient.tsx`

**Core State Management:**

```typescript
// DAMAC-specific state
const [damacRedeemItem, setDamacRedeemItem] = useState<CatalogueDisplayItem | null>(null);
const [damacSelectedAllocationId, setDamacSelectedAllocationId] = useState<string | null>(null);
const [damacSelectionDetails, setDamacSelectionDetails] = useState<AllocationWithStatus | null>(null);
const [damacFlowStatus, setDamacFlowStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
const [damacFlowError, setDamacFlowError] = useState<string | null>(null);
const [damacConfirmedLer, setDamacConfirmedLer] = useState<string | null>(null);
const [damacPendingSubmission, setDamacPendingSubmission] = useState<{
  allocation: AllocationWithStatus;
  catalogueAllocation: CatalogueUnitAllocation;
  lerCode: string;
} | null>(null);
const [damacInsufficientBalanceModal, setDamacInsufficientBalanceModal] = useState<{
  requiredPoints: number;
  availablePoints: number;
  shortfall: number;
  suggestedAed: number;
  allocation: AllocationWithStatus;
  catalogueAllocation: CatalogueUnitAllocation;
  lerCode: string;
} | null>(null);
```

**Key Functions:**

**`handleDamacProceed` (lines 984-1041):**
- Called after successful LER verification
- Validates unit availability and points requirement
- **Balance check #1**: Compares available points vs required points
- If insufficient → Shows interstitial modal (`setDamacInsufficientBalanceModal`) with calculated details
- If sufficient → Sets `damacPendingSubmission` to show confirmation screen

**`handleBuyPointsForDamac` (lines 1091-1108):**
- Called when user clicks "Buy Points" in insufficient balance modal
- Opens Stripe checkout with context (rewardId, allocationId, lerCode)
- Sets flow status to 'submitting'
- Closes modal after redirect

**`closeDamacInsufficientBalanceModal` (lines 1110-1112):**
- Called when user clicks "Go Back" in insufficient balance modal
- Closes modal, returns user to map selector

**`submitDamacRedemption` (lines 1024-1070):**
- Called when user clicks "Confirm & redeem"
- **Balance check #2**: Re-validates balance before submission (safety net)
- POSTs to `/api/redeem` with allocation details and `damacLerReference`
- On success → Sets `damacFlowStatus` to 'success'
- On error → Shows error message, keeps confirmation screen visible

**`startStripeCheckout` (lines 588-615):**
- Accepts amount and context object: `{ rewardId, allocationId, lerCode }`
- Sends context to Stripe API for URL parameter preservation
- Redirects to Stripe payment page

**Auto-Restore Logic (lines 1144-1170):**
```typescript
useEffect(() => {
  if (!autoOpenRewardId || !catalogue) return;
  const item = catalogue.find((i) => i.id === autoOpenRewardId);
  if (!item) return;

  if (item.category === 'token' && item.id.includes('damac')) {
    setDamacRedeemItem(item);

    // Restore confirmation screen if all context present
    if (autoSelectAllocationId && autoVerifiedLerCode) {
      const allocation = item.unitAllocations.find((a) => a.id === autoSelectAllocationId);
      if (allocation) {
        const allocationWithStatus: AllocationWithStatus = {
          id: allocation.id,
          points: allocation.points ?? undefined,
          unitType: allocation.unitType ?? undefined,
          priceAed: allocation.priceAed ?? undefined,
          propertyPrice: allocation.propertyPrice ?? undefined,
          availability: 'available' as const,
        };
        setDamacPendingSubmission({
          allocation: allocationWithStatus,
          catalogueAllocation: allocation,
          lerCode: autoVerifiedLerCode,
        });
      }
    }
  }
}, [autoOpenRewardId, autoSelectAllocationId, autoVerifiedLerCode, catalogue]);
```

**Conditional Rendering:**

The modal content shows different screens based on state:

```typescript
{damacFlowStatus === 'success' ? (
  // Success screen (centered)
) : !damacPendingSubmission ? (
  // Map selector
) : (
  // Confirmation screen (centered)
)}
```

**Insufficient Balance Modal (lines 1789-1845):**

Rendered as a separate overlay (z-index: 70, above DAMAC modal) when `damacInsufficientBalanceModal` is set:

```typescript
{damacInsufficientBalanceModal ? (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
    <div className="relative w-full max-w-md rounded-[24px] border border-[#d1b7fb]/70 bg-white p-6">
      {/* Warning icon, message, points breakdown, action buttons */}
    </div>
  </div>
) : null}
```

Features:
- Amber warning icon with border styling
- Clear insufficient balance message
- Visual breakdown table with Required/Available/Shortfall points
- Suggested top-up amount calculation display
- Two action buttons: "Buy Points" (primary) and "Go Back" (secondary)
- Emphasizes loyalty ecosystem before payment redirect

### 2.2 `components/redeem/DamacMapSelector.tsx`

**Purpose:** Interactive map interface for unit selection and LER verification

**Key Features:**
- Fetches allocations from `/api/damac/map`
- Interactive zoom/pan map with touch/scroll support
- Bedroom filter (Studio, 1 BR, 2 BR, 3 BR, 4 BR, 5 BR, 6 BR)
- Search by unit code
- Real-time availability indicators
- Session-based "agents viewing" counter
- LER form with warning modal
- Price display using `property_price` field (fallback to `priceAed`)

**LER Verification Flow (lines 280-360):**
1. User selects unit from map
2. Clicks "Proceed to Redemption" button → LER form appears
3. User enters numeric LER digits
4. Clicks "Confirm LER" → Warning modal appears
5. Clicks "Proceed" → POSTs to `/api/damac/ler/verify`
6. On success → Calls `onRequestProceed({ allocation, lerCode })`
7. Overlays hide automatically when `onRequestProceed && lerVerifiedCode` exists

**Props:**
```typescript
type DamacMapSelectorProps = {
  catalogueId: string;
  selectedAllocationId: string | null;
  onSelectAllocation: (id: string | null) => void;
  onSelectionChange?: (allocation: AllocationWithStatus | null) => void;
  onRequestProceed?: (payload: { allocation: AllocationWithStatus; lerCode: string }) => void;
  hideOuterFrame?: boolean;
};
```

**Export Type:**
```typescript
export type AllocationWithStatus = {
  id: string;
  points?: number;
  unitType?: string;
  priceAed?: number;
  propertyPrice?: number;
  plotAreaSqft?: number;
  saleableAreaSqft?: number;
  availability: 'available' | 'booked';
  damacIslandcode?: string;
  brType?: string;
};
```

### 2.3 `components/CatalogueGrid.tsx`

**DAMAC Item Rendering (lines 117-160):**
- Detects `damacIslandCampaign` flag
- Forces button label to "View availability"
- Keeps button enabled even in "Coming soon" status
- Calls `onRedeem(item)` to trigger DAMAC flow

### 2.4 `app/dashboard/page.tsx`

**URL Parameter Extraction:**
```typescript
const rewardParam = sp?.reward;
const rewardId = Array.isArray(rewardParam) ? rewardParam[0] : rewardParam;

const allocationParam = sp?.allocation;
const allocationId = Array.isArray(allocationParam) ? allocationParam[0] : allocationParam;

const lerParam = sp?.ler;
const lerCode = Array.isArray(lerParam) ? lerParam[0] : lerParam;
```

**Props Passed to DashboardClient:**
```typescript
<DashboardClient
  agentId={agentId}
  agentCode={agentCode}
  identifierLabel={identifierLabel}
  activeView={activeView}
  topupStatus={topupStatus}
  autoOpenRewardId={rewardId}
  autoSelectAllocationId={allocationId}
  autoVerifiedLerCode={lerCode}
  minTopup={minTopup}
  pointsPerAed={pointsPerAed}
  ledgerHref={ledgerHref}
  catalogueHref={catalogueHref}
  learnHref={learnHref}
  baseQuery={baseQuery}
/>
```

## 3. API Endpoints

### 3.1 `GET /api/damac/map`

**Purpose:** Fetch all available unit allocations for the map

**Query Parameters:**
- `catalogueId` (optional): Filter by catalogue item

**Response:**
```typescript
{
  allocations: Array<{
    id: string;
    unitType: string | null;
    points: number | null;
    priceAed: number | null;
    propertyPrice: number | null;
    availability: 'available' | 'booked';
    damacIslandcode: string | null;
    brType: string | null;
    // ... other metadata
  }>
}
```

**Caching:** 30 seconds via `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`

**Implementation:** `app/api/damac/map/route.ts`

### 3.2 `POST /api/damac/ler/verify`

**Purpose:** Validate LER code hasn't been used

**Request Body:**
```typescript
{
  code: string;  // e.g., "LER-12341" or "12341"
}
```

**Response (Success):**
```typescript
{
  ok: true,
  code: "LER-12341"  // Normalized format
}
```

**Response (Failure):**
```typescript
{
  ok: false,
  reason: "already_used" | "not_found",
  message: "This LER code has already been redeemed" | "LER code not found"
}
```

**Implementation Details:**
- Normalizes code to "LER-XXXXX" format
- Queries Airtable `loyalty_redemption` table
- Checks both `LER` field and legacy `unit_alocation_promocode` field
- Returns already used if `damac_island_unit_allocation_redeemed` is true

**File:** `app/api/damac/ler/verify/route.ts`

### 3.3 `POST /api/redeem`

**Purpose:** Submit final redemption to Airtable webhook

**Request Body:**
```typescript
{
  agentId: string | null;
  agentCode: string | null;
  rewardId: string;
  rewardName: string;
  rewardPoints: number | null;
  priceAed: number | null;
  unitAllocationId: string;
  unitAllocationLabel: string | null;
  unitAllocationPoints: number | null;
  damacLerReference: string;  // The verified LER code
}
```

**Special Handling:**
- When `damacLerReference` is present, buyer verification is skipped
- `customerFirstName` and `customerPhoneLast4` are optional for DAMAC flow

**Response (Success):**
```typescript
{ ok: true }
```

**Response (Error):**
```typescript
{ error: string }
```

**Implementation:** `app/api/redeem/route.ts`

### 3.4 `POST /api/stripe/checkout`

**Purpose:** Create Stripe checkout session for insufficient balance

**Request Body:**
```typescript
{
  agentId: string;
  agentCode: string;
  amountAED: number;
  baseQuery: string;
  rewardId?: string;         // NEW: DAMAC item ID
  allocationId?: string;     // NEW: Selected unit ID
  lerCode?: string;          // NEW: Verified LER code
}
```

**Response:**
```typescript
{ url: string }  // Stripe checkout URL
```

**URL Generation:**
```typescript
// Success URL includes all context
/dashboard?topup=success&agent=recXXX&agentCode=AG123&reward=recYYY&allocation=recZZZ&ler=LER-12341

// Cancel URL includes same context
/dashboard?topup=cancel&agent=recXXX&agentCode=AG123&reward=recYYY&allocation=recZZZ&ler=LER-12341
```

**Implementation:** `app/api/stripe/checkout/route.ts`

## 4. Data Flow & State Transitions

### 4.1 State Diagram

```
[Catalogue]
    ↓ (Click "View availability")
[Terms & Conditions]
    ↓ (Accept)
[DAMAC Modal - Map Selector]
    ↓ (Select unit)
[Map with Selection Highlighted]
    ↓ (Enter LER)
[LER Warning Modal]
    ↓ (Proceed)
[LER Verification API Call]
    ↓
    ├─ Sufficient Balance ──────────→ [Confirmation Screen]
    │                                      ↓ (Confirm & redeem)
    │                                   [Processing]
    │                                      ↓
    │                                   [Success Screen]
    │
    └─ Insufficient Balance ───→ [Stripe Checkout]
                                      ↓ (Complete payment)
                                   [Redirect with Context]
                                      ↓
                                   [Auto-restore Confirmation Screen]
                                      ↓ (Confirm & redeem)
                                   [Processing]
                                      ↓
                                   [Success Screen]
```

### 4.2 Balance Validation Flow

```typescript
// Check 1: After LER verification (handleDamacProceed)
const requiredPoints = matchingAllocation.points;
const availablePoints = metrics.totalPosted;

if (availablePoints < requiredPoints) {
  // Calculate shortfall
  const shortfall = requiredPoints - availablePoints;
  const suggestedAed = normaliseTopupAmount(Math.ceil(shortfall / pointsPerAed), minTopup);

  // Open Stripe with full context
  await startStripeCheckout(suggestedAed, {
    rewardId: damacRedeemItem.id,
    allocationId: allocation.id,
    lerCode,
  });
  return;
}

// Show confirmation screen
setDamacPendingSubmission({ allocation, catalogueAllocation, lerCode });
```

```typescript
// Check 2: Before final submission (submitDamacRedemption)
const requiredPoints = catalogueAllocation.points;
const availablePoints = metrics.totalPosted;

if (requiredPoints && requiredPoints > 0 && availablePoints < requiredPoints) {
  setDamacFlowError(`Insufficient balance. You need ${requiredPoints.toLocaleString()} points but only have ${availablePoints.toLocaleString()} points.`);
  setDamacPendingSubmission(null);
  return;
}

// Proceed with API call
await fetch('/api/redeem', { ... });
```

## 5. Environment Variables

### Required

```bash
# Airtable
AIRTABLE_API_KEY=keyXXXXXXXXXXXXXX
AIRTABLE_BASE=appXXXXXXXXXXXXXX
AIRTABLE_TABLE_LOY=loyalty_redemption
AIRTABLE_TABLE_UNIT_ALLOCATIONS=unit_allocations
AIRTABLE_REDEEM_WEBHOOK=https://hooks.airtable.com/workflows/...

# Stripe
STRIPE_SECRET_KEY=sk_live_XXXXXXXXXXXX
NEXT_PUBLIC_APP_URL=https://collect.prypco.com

# Loyalty System
MIN_TOPUP_AED=500
POINTS_PER_AED=2
```

### Optional

```bash
# Airtable formatting
AIRTABLE_TIMEZONE=UTC
AIRTABLE_LOCALE=en-US

# Stripe limits
STRIPE_MAX_AED=999999
```

## 6. Security & Validation

### 6.1 Authentication

- Main dashboard requires HTTP Basic Auth via `middleware.ts`
- `/api/damac/ler/verify` explicitly bypassed from auth (public endpoint)
- `/api/damac/map` explicitly bypassed from auth (public endpoint)

### 6.2 Input Validation

**LER Code:**
- Accepts numeric input only (UI level)
- Normalized to "LER-XXXXX" format (API level)
- Checked against existing redemptions
- Race condition possible: two agents submitting same LER simultaneously could both pass verification

**Balance:**
- Validated twice: at confirmation screen display and before final submission
- Prevents edge cases where balance changes mid-flow

**Allocation:**
- Validated against current catalogue snapshot
- Rejects if allocation no longer exists

### 6.3 Error Handling

**Network Errors:**
- Map fetch failures show error card with "Try again" button
- LER verification failures show inline error in form
- Redemption API errors display in modal, keep confirmation screen visible

**Edge Cases:**
- Missing `property_price` → Falls back to `priceAed`
- Missing LER field in Airtable → Falls back to `unit_alocation_promocode`
- Missing points value → Blocks redemption client-side
- Allocation no longer available → Forces re-selection

## 7. UX Improvements Implemented

### 7.1 Visual State Transitions

**Problem:** Overlays and modals competing for attention
**Solution:** Clear screen replacement based on state
- Map selector visible → Confirmation card replaces it → Success screen replaces that
- No overlapping modals or hidden content

### 7.2 Centered Layouts

**Problem:** Confirmation card appeared at bottom of screen
**Solution:** Flexbox centering with `min-h-[60vh] items-center justify-center`

### 7.3 Stripe Context Preservation

**Problem:** After payment, user returned to general dashboard
**Solution:** URL parameters preserve exact state:
- `reward=recXXX` - Which item
- `allocation=recYYY` - Which unit
- `ler=LER-12341` - Verified LER code

### 7.4 Auto-scroll Removal

**Problem:** Tried to scroll to confirmation card programmatically
**Solution:** Proper centering makes scroll unnecessary

### 7.5 Terms & Conditions

**Problem:** Text wasn't emphasized enough
**Solution:** Purple-colored scrollable text area

### 7.6 Insufficient Balance Interstitial Modal

**Problem:** Direct redirect to Stripe felt transactional, didn't emphasize loyalty ecosystem
**Solution:** Added interstitial modal before payment redirect:
- User must acknowledge they need more points
- Clear visual breakdown of required/available/shortfall
- Explicit "Buy Points" action reinforces prypco One value proposition
- "Go Back" option allows reconsideration
- Nudges users to understand the loyalty mechanism

### 7.7 Consistent Button Language

**Problem:** "Proceed to Payment" suggested direct purchase flow
**Solution:** Changed to "Proceed to Redemption" to emphasize loyalty/rewards context

## 8. Known Limitations & Future Work

### 8.1 Race Conditions

**LER Verification:** If two agents verify the same LER simultaneously, both could proceed to confirmation. The webhook only blocks the second submission, not the verification step.

**Mitigation:** Consider atomic locking at verification time, not just redemption time.

### 8.2 Balance Changes Mid-Flow

**Scenario:** User verifies LER, balance is sufficient, but points are consumed elsewhere before clicking "Confirm & redeem"

**Current Handling:** Second balance check catches this and shows error message

**Improvement:** Could add real-time balance monitoring or point reservation

### 8.3 Browser Back Button

**Issue:** User navigating with browser back/forward after Stripe payment might see stale state

**Current Handling:** URL parameters re-trigger auto-restore on page load

### 8.4 Mobile Optimizations

- Map selector has responsive layouts but could benefit from touch gesture improvements
- Zoom/pan experience could be smoother on smaller screens

### 8.5 Analytics

No tracking events currently implemented for:
- LER verification attempts/failures
- Stripe abandonment rate
- Time spent on unit selection
- Popular unit types

### 8.6 Testing

- No automated tests for DAMAC flow
- Manual QA only
- Consider adding:
  - Unit tests for balance validation
  - Integration tests for API endpoints
  - E2E tests for complete flow

### 8.7 Performance

- Map image is not optimized (`<img>` vs `next/image`)
- Triggers build warning: `@next/next/no-img-element`
- Could improve LCP (Largest Contentful Paint)

## 9. Troubleshooting Guide

### Issue: Modal doesn't open

**Check:**
1. Is `damacIslandCampaign` true in Airtable?
2. Are there unit allocations linked to the catalogue item?
3. Browser console for JavaScript errors

### Issue: LER verification fails

**Check:**
1. Is LER field present in Airtable `loyalty_redemption` table?
2. Is `AIRTABLE_API_KEY` valid?
3. Network tab: verify `/api/damac/ler/verify` returns 200
4. Check if LER already used: look for existing record with that code

### Issue: Stripe doesn't redirect back

**Check:**
1. Is `NEXT_PUBLIC_APP_URL` set correctly?
2. Stripe webhook configuration (if implemented)
3. Browser console for redirect errors

### Issue: Confirmation screen doesn't show

**Check:**
1. `damacPendingSubmission` state in React DevTools
2. Balance validation: is `metrics.totalPosted` >= required points?
3. Console logs for errors during `handleDamacProceed`

### Issue: Success screen doesn't appear

**Check:**
1. `/api/redeem` response status (Network tab)
2. `AIRTABLE_REDEEM_WEBHOOK` environment variable
3. `damacFlowStatus` state should be 'success'

## 10. File Reference

### Core Implementation Files

```
components/
├── DashboardClient.tsx          # Main orchestration, state management
├── CatalogueGrid.tsx            # DAMAC item rendering
└── redeem/
    ├── DamacMapSelector.tsx     # Interactive map, LER form
    ├── TermsDialog.tsx          # T&C acceptance
    └── index.ts                 # Exports

app/
├── dashboard/
│   └── page.tsx                 # URL parameter extraction
└── api/
    ├── damac/
    │   ├── map/route.ts         # Allocation data API
    │   └── ler/verify/route.ts  # LER verification API
    ├── redeem/route.ts          # Redemption submission
    └── stripe/checkout/route.ts # Stripe integration

lib/
├── airtable.ts                  # Data fetching utilities
├── damac.ts                     # LER lookup logic
└── airtableRateLimiter.ts       # API rate limiting
```

### Support Files

```
docs/
└── damac-islands-token-redemption.md  # This document

middleware.ts                    # Auth bypass configuration
```

## 11. Maintenance Checklist

When modifying the DAMAC flow:

- [ ] Update this documentation
- [ ] Test both sufficient and insufficient balance paths
- [ ] Test Stripe redirect with all URL parameters
- [ ] Verify LER verification with various input formats
- [ ] Check mobile responsive layouts
- [ ] Verify error states display correctly
- [ ] Test browser back button behavior
- [ ] Confirm webhook receives all required fields
- [ ] Update environment variable documentation if needed
- [ ] Run full build to check for TypeScript errors

## 12. Version History

**Current Version:** 2.0 (November 2025)

**Major Changes from v1.0:**
- Complete state transition rewrite for clear UX
- Stripe context preservation (reward, allocation, LER)
- Auto-restore confirmation screen after payment
- Dual balance validation
- Centered layouts for confirmation and success screens
- Removed confusing modal overlays
- Terms & Conditions text highlighting
- Property price field precedence
- Comprehensive error handling

---

**Last Updated:** November 13, 2025
**Maintained By:** Development Team
**Contact:** For questions or updates, refer to project repository
