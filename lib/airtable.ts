import { scheduleAirtableRequest } from './airtableRateLimiter';

export type AirtableRecord<T> = {
  id: string;
  createdTime: string; // ISO string from Airtable
  fields: T;
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function toMaybeString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === 'string' && obj.value.trim()) return obj.value.trim();
    if (typeof obj.value === 'number' && Number.isFinite(obj.value)) return String(obj.value);
    if (typeof obj.id === 'string' && obj.id.trim()) return obj.id.trim();
    if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
    if (typeof obj.text === 'string' && obj.text.trim()) return obj.text.trim();
  }
  return undefined;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    const results: string[] = [];
    for (const item of value) {
      const maybe = toMaybeString(item);
      if (maybe) results.push(maybe);
    }
    return results;
  }
  const single = toMaybeString(value);
  return single ? [single] : [];
}

function toMaybeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const TRUE_STRINGS = new Set(['true', 'checked', '1', 'yes']);

function toBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return TRUE_STRINGS.has(normalized);
  }
  return false;
}

function isPreviewEnv(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv.toUpperCase() === 'PREVIEW') {
    return true;
  }
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

export type PublicLoyaltyRow = {
  id: string;
  createdTime: string;
  earned_at?: string;
  points: number;
  type: string;
  type_display_name?: string;
  rule_code: string;
  status: string;
  expires_at?: string;
  source_txn?: string[];
  source_channel?: string[] | string;
  description_display_name?: string;
};

export type CatalogueFields = {
  name?: string;
  price_aed?: number;
  points?: number;
  Link?: string;
  display_rank?: number;
  status_project_allocation?:
    | 'Active'
    | 'Coming Soon'
    | 'Last Units'
    | 'Sold Out'
    | 'active'
    | 'coming soon'
    | 'last units'
    | 'sold out'
    | string;
  released_status?: 'Available' | 'Not Released' | string;
  unit_allocation?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
  image?: Array<{ url: string; filename?: string; thumbnails?: { large?: { url: string }; small?: { url: string } } }>;
  description?: string;
  is_active?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
  staging_active?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
  requiresBuyerVerification?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
  damacIslandCampaign?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
  'T&C'?: string;
  'T&C_active'?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
  'T&C_version'?: string;
  'T&C_url'?: string;
};

export type CatalogueItem = AirtableRecord<CatalogueFields>;

export type UnitAllocationFields = {
  Catalogue?: string[] | string;
  unit_type?: string;
  max_stock?: number;
  Points?: number;
  price_aed?: number;
  property_price?: number;
  Picture?: Array<{ url: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } }>;
  damacIslandcode?: string;
  'BR Type'?: string;
  remaining_stock?: number;
  'Plot Area (sqft)'?: number;
  'Saleable Area (sqft)'?: number;
  released_status?: 'Available' | 'Not Released' | string;
  'Unit Status'?: string;
};

export type CatalogueUnitAllocation = {
  id: string;
  catalogueId: string | null;
  unitType: string | null;
  maxStock: number | null;
  points: number | null;
  pictureUrl: string | null;
  priceAed: number | null;
  propertyPrice: number | null;
  damacIslandcode: string | null;
  brType: string | null;
  remainingStock: number | null;
  plotAreaSqft: number | null;
  saleableAreaSqft: number | null;
  releasedStatus: string | null;
  unitStatus?: string | null;
  // Reservation fields (from Supabase real-time system)
  reservedBy?: string | null;
  reservedAt?: string | null;
  reservedLerCode?: string | null;
  reservationExpiresAt?: string | null;
};

export type CatalogueItemWithAllocations = CatalogueItem & {
  unitAllocations: CatalogueUnitAllocation[];
};

export type CatalogueProjectStatus = 'active' | 'coming_soon' | 'last_units' | 'sold_out';


/**
 * Fetch unit allocations from Supabase (real-time data with reservation info)
 */
export async function fetchUnitAllocationsFromSupabase(onlyWithStock = true): Promise<CatalogueUnitAllocation[]> {
  console.log('🔵 FETCHING FROM SUPABASE - unit_allocations table (onlyWithStock:', onlyWithStock, ')');
  const { getSupabaseAdminClient } = await import('@/lib/supabaseClient');
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('unit_allocations' as never)
    .select('*')
    .or('released_status.is.null,released_status.eq.Available');
  
  // Only filter by stock if requested (for catalogue count)
  // Map selector needs ALL units to show sold-out ones as disabled
  if (onlyWithStock) {
    query = query.gt('remaining_stock', 0);
  }

  const { data, error } = query as unknown as {
    data: Array<{
      id: string;
      catalogue_id: string | null;
      unit_type: string | null;
      max_stock: number | null;
      points: number | null;
      picture_url: string | null;
      price_aed: number | null;
      property_price: number | null;
      damac_island_code: string | null;
      br_type: string | null;
      remaining_stock: number | null;
      plot_area_sqft: number | null;
      saleable_area_sqft: number | null;
      released_status: string | null;
      reserved_by: string | null;
      reserved_at: string | null;
      reserved_ler_code: string | null;
      reservation_expires_at: string | null;
    }> | null;
    error: Error | null;
  };

  if (error) {
    throw new Error(`Supabase unit allocations error: ${error.message}`);
  }
  console.log(`🟢 SUPABASE returned ${(data ?? []).length} unit allocations`);

  return (data ?? []).map((row) => ({
    id: row.id,
    catalogueId: row.catalogue_id,
    unitType: row.unit_type,
    maxStock: row.max_stock,
    points: row.points,
    pictureUrl: row.picture_url,
    priceAed: row.price_aed,
    propertyPrice: row.property_price,
    damacIslandcode: row.damac_island_code,
    brType: row.br_type,
    remainingStock: row.remaining_stock,
    plotAreaSqft: row.plot_area_sqft,
    saleableAreaSqft: row.saleable_area_sqft,
    releasedStatus: row.released_status,
    // Reservation fields from Supabase
    reservedBy: row.reserved_by,
    reservedAt: row.reserved_at,
    reservedLerCode: row.reserved_ler_code,
    reservationExpiresAt: row.reservation_expires_at,
  }));
}

/**
 * Fetch unit allocations from Airtable (legacy data source)
 * @param onlyAvailable - If true (default), only return available units. If false, return ALL units including sold/unavailable.
 */
export async function fetchUnitAllocationsFromAirtable(onlyAvailable = true): Promise<CatalogueUnitAllocation[]> {
  const apiKey = env('AIRTABLE_API_KEY');
  const baseId = env('AIRTABLE_BASE');
  const table = process.env.AIRTABLE_TABLE_UNIT_ALLOCATIONS || 'loyalty_unit_allocation';

  const urlBase = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  } as const;

  const records: AirtableRecord<UnitAllocationFields>[] = [];
  let offset: string | undefined;
  let guard = 0;

  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);

    const res = await scheduleAirtableRequest(() =>
      fetch(`${urlBase}?${params.toString()}`, {
        headers,
        cache: 'no-store',
      })
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable unit allocation error ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      records: AirtableRecord<UnitAllocationFields>[];
      offset?: string;
    };
    records.push(...json.records);
    offset = json.offset;
    guard++;
  } while (offset && guard < 20);

  return records
    .filter((record) => {
      // Skip filtering if admin wants all units
      if (!onlyAvailable) return true;

      // Only show allocations with released_status = 'Available'
      const releasedStatus = record.fields?.released_status;
      return !releasedStatus || releasedStatus === 'Available';
    })
    .map((record) => {
      const fields = record.fields || {};
      const catalogueIds = toStringArray(fields.Catalogue);
      const pictureAttachment = Array.isArray(fields.Picture) && fields.Picture.length > 0 ? fields.Picture[0] : null;
      const pictureUrl = pictureAttachment?.thumbnails?.large?.url || pictureAttachment?.url || null;

      return {
        id: record.id,
        catalogueId: catalogueIds[0] ?? null,
        unitType: toMaybeString(fields.unit_type) ?? null,
        maxStock: typeof fields.max_stock === 'number' ? fields.max_stock : null,
        points: typeof fields.Points === 'number' ? fields.Points : null,
        pictureUrl,
        priceAed: typeof fields.price_aed === 'number' ? fields.price_aed : null,
        propertyPrice: typeof fields.property_price === 'number' ? fields.property_price : null,
        damacIslandcode: toMaybeString(fields.damacIslandcode) ?? null,
        brType: toMaybeString(fields['BR Type']) ?? null,
        remainingStock: toMaybeNumber(fields.remaining_stock) ?? null,
        plotAreaSqft: toMaybeNumber(fields['Plot Area (sqft)']) ?? null,
        saleableAreaSqft: toMaybeNumber(fields['Saleable Area (sqft)']) ?? null,
        releasedStatus: toMaybeString(fields.released_status) ?? null,
        unitStatus: toMaybeString(fields['Unit Status']) ?? null,
        // No reservation fields from Airtable
      } satisfies CatalogueUnitAllocation;
    });
}

/**
 * Fetch unit allocations with feature flag support
 * Prefers Supabase when credentials exist unless the flag is explicitly set to "false"
 */
export async function fetchUnitAllocations(onlyWithStock = true): Promise<CatalogueUnitAllocation[]> {
  const envValue = process.env.ENABLE_SUPABASE_UNIT_ALLOCATIONS ?? 'true';
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const preferSupabase = envValue === 'true' || (!envValue && supabaseConfigured);
  const forceAirtable = envValue === 'false';

  console.log(
    '🔍 ENABLE_SUPABASE_UNIT_ALLOCATIONS =',
    envValue,
    '| supabaseConfigured =',
    supabaseConfigured,
    '| preferSupabase =',
    preferSupabase && !forceAirtable,
  );

  if (!forceAirtable && (preferSupabase || envValue === 'true')) {
    try {
      return await fetchUnitAllocationsFromSupabase(onlyWithStock);
    } catch (error) {
      console.error('❌ Supabase unit allocation fetch failed, falling back to Airtable:', error);
    }
  }

  console.log('⚠️ USING AIRTABLE for unit allocations');
  return fetchUnitAllocationsFromAirtable();
}

/**
 * Fetch loyalty catalogue base (items only, no unit allocations)
 * Used by API route to cache catalogue structure separately from real-time allocations
 */
export async function fetchLoyaltyCatalogueBase(): Promise<CatalogueItem[]> {
  const apiKey = env('AIRTABLE_API_KEY');
  const baseId = env('AIRTABLE_BASE');
  const table = process.env.AIRTABLE_TABLE_CATALOGUE || 'loyalty_catalogue';

  const urlBase = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  } as const;

  const records: CatalogueItem[] = [];
  let offset: string | undefined;
  let guard = 0;

  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    params.set('sort[0][field]', 'display_rank');
    params.set('sort[0][direction]', 'asc');
    if (offset) params.set('offset', offset);

    const res = await scheduleAirtableRequest(() =>
      fetch(`${urlBase}?${params.toString()}`, {
        headers,
        cache: 'no-store',
      }),
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable catalogue error ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      records: CatalogueItem[];
      offset?: string;
    };
    records.push(...json.records);
    offset = json.offset;
    guard++;
  } while (offset && guard < 20);

  return records.filter((item) => {
    const isActive = toBooleanFlag(item.fields?.is_active);
    const stagingActive = toBooleanFlag(item.fields?.staging_active);
    
    // Production: only show items with is_active=true
    if (!isPreviewEnv()) {
      return isActive;
    }
    
    // Preview/Staging: show items with is_active=true OR staging_active=true
    return isActive || stagingActive;
  });
}

export async function fetchLoyaltyCatalogue(): Promise<CatalogueItemWithAllocations[]> {
  const apiKey = env('AIRTABLE_API_KEY');
  const baseId = env('AIRTABLE_BASE');
  const table = process.env.AIRTABLE_TABLE_CATALOGUE || 'loyalty_catalogue';

  const urlBase = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  } as const;

  const records: CatalogueItem[] = [];
  let offset: string | undefined;
  let guard = 0;

  do {
    const params = new URLSearchParams();
    params.set('pageSize', '100');
    params.set('sort[0][field]', 'display_rank');
    params.set('sort[0][direction]', 'asc');
    if (offset) params.set('offset', offset);

    const res = await scheduleAirtableRequest(() =>
      fetch(`${urlBase}?${params.toString()}`, {
        headers,
        cache: 'no-store',
      }),
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable catalogue error ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      records: CatalogueItem[];
      offset?: string;
    };
    records.push(...json.records);
    offset = json.offset;
    guard++;
  } while (offset && guard < 20);

  const allocations = await fetchUnitAllocations();
  const allocationsByCatalogue = new Map<string, CatalogueUnitAllocation[]>();
  for (const allocation of allocations) {
    if (!allocation.catalogueId) continue;
    const existing = allocationsByCatalogue.get(allocation.catalogueId);
    if (existing) existing.push(allocation);
    else allocationsByCatalogue.set(allocation.catalogueId, [allocation]);
  }

  return records
    .filter((item) => {
      // Check if active
      const active = item.fields?.is_active;
      const isActive = typeof active === 'boolean' ? active : (active === 'checked' || active === 'TRUE');
      return isActive;
    })
    .map((item) => ({
      ...item,
      unitAllocations: allocationsByCatalogue.get(item.id) ?? [],
    }));
}
