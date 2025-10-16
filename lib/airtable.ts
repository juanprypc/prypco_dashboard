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
  unit_allocation?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
  image?: Array<{ url: string; filename?: string; thumbnails?: { large?: { url: string }; small?: { url: string } } }>;
  description?: string;
  is_active?: 'checked' | 'unchecked' | 'TRUE' | 'FALSE' | boolean;
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
  Picture?: Array<{ url: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } }>;
};

export type CatalogueUnitAllocation = {
  id: string;
  catalogueId: string | null;
  unitType: string | null;
  maxStock: number | null;
  points: number | null;
  pictureUrl: string | null;
  priceAed: number | null;
};

export type CatalogueItemWithAllocations = CatalogueItem & {
  unitAllocations: CatalogueUnitAllocation[];
};

export type CatalogueProjectStatus = 'active' | 'coming_soon' | 'last_units' | 'sold_out';


async function fetchUnitAllocations(): Promise<CatalogueUnitAllocation[]> {
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

  return records.map((record) => {
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
    } satisfies CatalogueUnitAllocation;
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
      const active = item.fields?.is_active;
      if (typeof active === 'boolean') return active;
      return active === 'checked' || active === 'TRUE';
    })
    .map((item) => ({
      ...item,
      unitAllocations: allocationsByCatalogue.get(item.id) ?? [],
    }));
}
