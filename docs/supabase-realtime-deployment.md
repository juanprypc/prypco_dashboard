# Supabase Real-time Unit Allocation System - Deployment Guide

## Overview

This document outlines the deployment steps for the new Supabase-based real-time unit allocation system with reservation locks to prevent double-booking.

## What Was Added

### 1. Supabase Database Schema
- **Table**: `unit_allocations` - Real-time cache of Airtable's `loyalty_unit_allocation` table
- **Functions**:
  - `create_reservation(p_unit_id, p_agent_id, p_ler_code, p_duration_minutes)` - Atomic reservation lock
  - `release_reservation(p_unit_id, p_agent_id)` - Manual release
  - `expire_reservations()` - Auto-expire old locks
- **RLS Policies**: Public read, service role write

### 2. API Endpoints (Node.js runtime)
- `POST /api/reservations/create` - Creates 5-minute reservation lock
- `POST /api/reservations/release` - Releases reservation manually
- `GET /api/cron/expire-reservations` - Cron job to expire old reservations
- `POST /api/webhooks/airtable` - Webhook for Airtable sync (optional, not used if direct PostgREST)

### 3. Vercel Cron Job
- Runs every minute: `* * * * *`
- Calls `/api/cron/expire-reservations` to clean up expired locks

### 4. Airtable Integration
- Direct PostgREST upsert from Airtable automation
- Syncs on both create AND update events
- Single automation handles all unit allocation changes

## Required Environment Variables

Add these to your Vercel project (Settings → Environment Variables):

```bash
# Supabase (already required for existing features)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Webhook secret for Airtable webhook endpoint (if using webhook instead of direct PostgREST)
AIRTABLE_WEBHOOK_SECRET=your-secret-here

# Optional: Cron job secret (recommended for production)
CRON_SECRET=your-cron-secret-here
```

**Note**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already required for existing features (agent profiles, loyalty points, receipts), so you likely already have these configured.

## Deployment Checklist

### ✅ Step 1: Supabase Migrations (COMPLETED)
- [x] Run `supabase/migrations/20251116194747_unit_allocations_realtime.sql` in Supabase SQL Editor
- [x] Run `supabase/migrations/20251116195500_fix_unit_allocations_rls.sql` in Supabase SQL Editor
- [x] Verify functions exist in Supabase Dashboard → Database → Functions
- [x] Verify table exists in Supabase Dashboard → Table Editor

### ⏳ Step 2: Airtable Automation Setup (PENDING)
- [ ] Create new automation in Airtable for `loyalty_unit_allocation` table
- [ ] Trigger: **When a record is created OR updated**
- [ ] Action: **Run script** (use the script provided in this guide below)
- [ ] Configure inputs:
  - `recordId`: Dynamic from trigger
  - `supabaseUrl`: Your Supabase project URL
  - `supabaseKey`: Your Supabase **SERVICE_ROLE** key (not anon key!)
  - `supabaseTable`: `unit_allocations`
  - `supabasePk`: `id`

### ⏳ Step 3: Deploy to Vercel (PENDING)
- [ ] Code is committed and pushed to `staging` branch
- [ ] Vercel auto-deploys from push
- [ ] Verify environment variables are set in Vercel dashboard
- [ ] Check deployment logs for any errors

### ⏳ Step 4: Test Backend (PENDING)
- [ ] Test `/api/reservations/create` endpoint
- [ ] Test `/api/reservations/release` endpoint
- [ ] Test `/api/cron/expire-reservations` endpoint
- [ ] Verify Airtable automation is syncing data to Supabase
- [ ] Check Supabase table has data from Airtable

### ⏳ Step 5: Frontend Integration (NOT STARTED)
- [ ] Integrate reservation lock in DAMAC redemption flow
- [ ] Add Supabase real-time subscription to DAMAC map
- [ ] Test reservation expiry countdown
- [ ] Test double-booking prevention

## Airtable Automation Script

Use this script in your Airtable automation:

```javascript
/***** INPUTS *****/
const {
  recordId,
  supabaseUrl,      // https://xxxxx.supabase.co
  supabaseKey,      // ⚠️ USE SERVICE_ROLE KEY, NOT ANON KEY
  supabaseTable,    // unit_allocations
  supabasePk,       // id
} = input.config();

if (!recordId) throw new Error("Missing input: recordId");
if (!supabaseUrl) throw new Error("Missing input: supabaseUrl");
if (!supabaseKey) throw new Error("Missing input: supabaseKey");
if (!supabaseTable) throw new Error("Missing input: supabaseTable");

/***** AIRTABLE TABLE / FIELDS *****/
const UNIT_ALLOCATIONS_TABLE = "loyalty_unit_allocation";
const F = {
  catalogue: "Catalogue",
  unit_type: "unit_type",
  max_stock: "max_stock",
  points: "Points",
  price_aed: "price_aed",
  property_price: "property_price",
  picture: "Picture",
  damac_island_code: "damacIslandcode",
  br_type: "BR Type",
  remaining_stock: "remaining_stock",
  plot_area: "Plot Area (sqft)",
  saleable_area: "Saleable Area (sqft)",
  released_status: "released_status",
};

/***** HELPERS *****/
const toStr = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

const toNum = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const getFirstLinkedRecordId = (linkedRecords) => {
  if (!linkedRecords || !Array.isArray(linkedRecords)) return null;
  return linkedRecords.length > 0 ? linkedRecords[0].id : null;
};

const getPictureUrl = (attachments) => {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) return null;
  const first = attachments[0];
  return first?.thumbnails?.large?.url || first?.url || null;
};

const getSingleSelect = (value) => {
  if (value == null) return null;
  // Airtable single-select returns {id: "...", name: "Available"}
  if (typeof value === "object" && value.name) {
    return String(value.name).trim() || null;
  }
  return toStr(value);
};

/***** READ RECORD *****/
const table = base.getTable(UNIT_ALLOCATIONS_TABLE);
const rec = await table.selectRecordAsync(recordId);
if (!rec) throw new Error(`Record not found in '${UNIT_ALLOCATIONS_TABLE}': ${recordId}`);

/***** EXTRACT FIELDS *****/
const catalogue_linked = rec.getCellValue(F.catalogue);
const catalogue_id = getFirstLinkedRecordId(catalogue_linked);
const unit_type = getSingleSelect(rec.getCellValue(F.unit_type));
const max_stock = toNum(rec.getCellValue(F.max_stock));
const points = toNum(rec.getCellValue(F.points));
const price_aed = toNum(rec.getCellValue(F.price_aed));
const property_price = toNum(rec.getCellValue(F.property_price));
const picture_attachments = rec.getCellValue(F.picture);
const picture_url = getPictureUrl(picture_attachments);
const damac_island_code = toStr(rec.getCellValue(F.damac_island_code));
const br_type = toStr(rec.getCellValue(F.br_type));
const remaining_stock = toNum(rec.getCellValue(F.remaining_stock));
const plot_area_sqft = toNum(rec.getCellValue(F.plot_area));
const saleable_area_sqft = toNum(rec.getCellValue(F.saleable_area));
const released_status = getSingleSelect(rec.getCellValue(F.released_status));

/***** BUILD PAYLOAD *****/
const payload = {
  [supabasePk]: rec.id,
  catalogue_id: catalogue_id,
  unit_type: unit_type,
  max_stock: max_stock,
  points: points,
  picture_url: picture_url,
  price_aed: price_aed,
  property_price: property_price,
  damac_island_code: damac_island_code,
  br_type: br_type,
  remaining_stock: remaining_stock,
  plot_area_sqft: plot_area_sqft,
  saleable_area_sqft: saleable_area_sqft,
  released_status: released_status,
  synced_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/***** UPSERT → SUPABASE *****/
const url =
  `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(supabaseTable)}` +
  `?on_conflict=${encodeURIComponent(supabasePk)}`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  },
  body: JSON.stringify([payload]),
});

if (!res.ok) {
  const text = await res.text();
  throw new Error(`Supabase upsert failed (${res.status}): ${text}`);
}

const data = await res.json();

/***** LOGS *****/
output.set("upserted_rows", data?.length || 0);
output.set("first_row", data?.[0] || {});
output.set("record_id", rec.id);
```

## Testing the Backend

### 1. Test Reservation Creation

```bash
curl -X POST https://your-domain.vercel.app/api/reservations/create \
  -H "Content-Type: application/json" \
  -d '{
    "unitAllocationId": "recXXXXXXXXXXXX",
    "agentId": "recAgentXXXXXXXX",
    "lerCode": "LER1234",
    "durationMinutes": 5
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Reservation created",
  "unitId": "recXXXXXXXXXXXX",
  "expiresAt": "2025-11-16T17:33:50.837Z"
}
```

### 2. Test Reservation Release

```bash
curl -X POST https://your-domain.vercel.app/api/reservations/release \
  -H "Content-Type: application/json" \
  -d '{
    "unitAllocationId": "recXXXXXXXXXXXX",
    "agentId": "recAgentXXXXXXXX"
  }'
```

Expected response:
```json
{
  "success": true,
  "released": true,
  "message": "Reservation released successfully"
}
```

### 3. Test Cron Job (Expire Reservations)

```bash
curl https://your-domain.vercel.app/api/cron/expire-reservations \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "expiredCount": 2,
  "timestamp": "2025-11-16T17:30:00.000Z"
}
```

## Impact on Existing Features

### ✅ No Breaking Changes
- All existing API endpoints remain unchanged
- Existing Airtable → Supabase syncs (agent_profiles, loyalty_points) are unaffected
- Existing catalogue caching via Redis continues to work
- Stripe checkout flow remains the same

### ℹ️ New Dependencies
- Requires Supabase (already in use)
- Uses existing `getSupabaseAdminClient()` from `lib/supabaseClient.ts`
- No new npm packages required

## Next Steps (Frontend Integration)

After backend is deployed and tested:

1. **Update DashboardClient/DAMAC flow** to call `/api/reservations/create` after LER verification
2. **Add Supabase real-time subscription** to listen for unit availability changes
3. **Show reservation countdown timer** to user
4. **Handle reservation expiry** gracefully in UI

## Rollback Plan

If issues arise:

1. **Disable Airtable automation** to stop syncing to Supabase
2. **Revert Vercel deployment** to previous version
3. **Keep Supabase schema** - it doesn't affect existing features

The system is designed to be additive - removing it doesn't break existing functionality.
