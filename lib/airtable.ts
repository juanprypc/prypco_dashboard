import { scheduleAirtableRequest } from './airtableRateLimiter';

export type AirtableRecord<T> = {
  id: string;
  createdTime: string; // ISO string from Airtable
  fields: T;
};

export type LoyaltyFields = {
  agent?: string[] | string; // linked record ids or text
  points?: number;
  type?: string;
  type_display_name?: string;
  rule_code?: string;
  status?: string;
  earned_at?: string; // Created time field on the ledger row
  expires_at?: string; // date or ISO
  source_txn?: string[]; // linked record ids
  source_channel?: string | string[]; // single select or lookup array
  description_display_name?: string;
};

export type LoyaltyRow = AirtableRecord<LoyaltyFields>;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalise(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
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

const DEFAULT_AGENT_CODE_FIELDS = [
  'agent_code',
  'agent_code_lookup',
  'agent_id',
  'Agent ID',
  'Agents ID',
  'Agent Id',
  'agentId',
  'AgentID',
  'Agent Code',
  'Agent Code (from AGENTS)',
];

export function extractAgentCodes(fields: Record<string, unknown>): string[] {
  const codes = new Set<string>();
  const configured = process.env.AIRTABLE_FIELD_AGENT_CODE;
  const candidates = configured
    ? [configured, ...DEFAULT_AGENT_CODE_FIELDS.filter((field) => field !== configured)]
    : DEFAULT_AGENT_CODE_FIELDS;

  for (const fieldName of candidates) {
    const value = fields[fieldName];
    if (!value) continue;
    for (const code of toStringArray(value)) {
      codes.add(code);
    }
  }

  return [...codes];
}

function escapeFormulaValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

function getAgentCodeFieldName(): string {
  return process.env.AIRTABLE_FIELD_AGENT_CODE || 'agent_code';
}

type FilterOptions = {
  includeExpired?: boolean;
  agentId?: string;
  agentCode?: string;
  agentName?: string;
};

function buildFilterFormula({ includeExpired, agentId, agentCode, agentName }: FilterOptions): string {
  const clauses: string[] = ["{status}='posted'"];
  if (!includeExpired) clauses.push('OR({expires_at}="", {expires_at}>=TODAY())');

  const agentClauses: string[] = [];
  if (agentId) agentClauses.push(`FIND('${escapeFormulaValue(agentId)}', ARRAYJOIN({agent}))`);
  if (agentName) agentClauses.push(`FIND('${escapeFormulaValue(agentName)}', ARRAYJOIN({agent}))`);
  if (agentCode) {
    const fieldName = getAgentCodeFieldName();
    agentClauses.push(`{${fieldName}}='${escapeFormulaValue(agentCode)}'`);
  }

  if (agentClauses.length === 1) clauses.push(agentClauses[0]);
  else if (agentClauses.length > 1) clauses.push(`OR(${agentClauses.join(', ')})`);

  return `AND(${clauses.join(', ')})`;
}

async function fetchRecordsByFormula(filterByFormula: string): Promise<LoyaltyRow[]> {
  const apiKey = env('AIRTABLE_API_KEY');
  const baseId = env('AIRTABLE_BASE');
  const table = env('AIRTABLE_TABLE_LOY');

  const urlBase = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  } as const;

  const records: LoyaltyRow[] = [];
  let offset: string | undefined;
  let guard = 0;

  do {
    const params = new URLSearchParams();
    params.set('filterByFormula', filterByFormula);
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
      throw new Error(`Airtable error ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      records: LoyaltyRow[];
      offset?: string;
    };
    records.push(...json.records);
    offset = json.offset;
    guard++;
  } while (offset && guard < 20);

  const getWhen = (r: LoyaltyRow) => {
    const f = r.fields as LoyaltyFields | undefined;
    const when = (f && f.earned_at) || r.createdTime;
    return new Date(when).getTime();
  };
  records.sort((a, b) => getWhen(b) - getWhen(a));
  return records;
}

export async function fetchPostedUnexpiredRecords(includeExpired = false): Promise<LoyaltyRow[]> {
  return fetchRecordsByFormula(buildFilterFormula({ includeExpired }));
}

export type LoyaltyAgentFilter = {
  agentId?: string | null;
  agentCode?: string | null;
  agentName?: string | null;
  includeExpired?: boolean;
};

export async function fetchLoyaltyForAgent(
  arg: string | LoyaltyAgentFilter,
  legacyOpts?: { agentName?: string }
): Promise<LoyaltyRow[]> {
  const filter: LoyaltyAgentFilter =
    typeof arg === 'string'
      ? { agentId: arg, agentName: legacyOpts?.agentName }
      : { ...arg, agentName: arg.agentName ?? legacyOpts?.agentName };

  const agentId = normalise(filter.agentId ?? undefined);
  const agentCode = normalise(filter.agentCode ?? undefined);
  const agentName = normalise(filter.agentName ?? undefined);

  if (!agentId && !agentCode && !agentName) {
    return [];
  }

  const formula = buildFilterFormula({ includeExpired: filter.includeExpired, agentId, agentCode, agentName });
  return fetchRecordsByFormula(formula);
}

export type AgentProfile = {
  displayName: string | null;
  investorPromoCode: string | null;
  investorWhatsappLink: string | null;
};

function buildAgentProfile(fields: Record<string, unknown>): AgentProfile {
  const firstNameCandidates = ['First Name', 'first_name', 'FirstName', 'firstName'];
  let displayName: string | null = null;
  for (const key of firstNameCandidates) {
    const maybe = toMaybeString(fields[key]);
    if (maybe) {
      displayName = maybe;
      break;
    }
  }

  if (!displayName) {
    const candidates = ['Name', 'Full Name', 'Agent', 'Agent Name', 'Display Name'];
    for (const key of candidates) {
      const maybe = toMaybeString(fields[key]);
      if (maybe) {
        displayName = maybe;
        break;
      }
    }
  }

  if (!displayName) {
    for (const value of Object.values(fields)) {
      const maybe = toMaybeString(value);
      if (maybe) {
        displayName = maybe;
        break;
      }
    }
  }

  const investorPromoCode = toMaybeString(fields.promocode_mint_string) ?? null;
  const investorWhatsappLink = toMaybeString(fields.WhatsApp_Promo_Link) ?? null;

  return {
    displayName: displayName ?? null,
    investorPromoCode,
    investorWhatsappLink,
  };
}

export async function fetchAgentProfile(agentId: string): Promise<AgentProfile> {
  const apiKey = env('AIRTABLE_API_KEY');
  const baseId = env('AIRTABLE_BASE');
  const agentsTable = process.env.AIRTABLE_TABLE_AGENTS;
  if (!agentsTable)
    return { displayName: null, investorPromoCode: null, investorWhatsappLink: null };

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(agentsTable)}/${agentId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  if (!res.ok)
    return { displayName: null, investorPromoCode: null, investorWhatsappLink: null };
  const json = (await res.json()) as { id: string; fields: Record<string, unknown> };
  return buildAgentProfile(json.fields || {});
}

export async function fetchAgentProfileByCode(agentCode: string): Promise<AgentProfile | null> {
  const apiKey = env('AIRTABLE_API_KEY');
  const baseId = env('AIRTABLE_BASE');
  const agentsTable = process.env.AIRTABLE_TABLE_AGENTS;
  if (!agentsTable) return null;

  const fieldName = getAgentCodeFieldName();
  const filter = `FILTER_BY_FORMULA=${encodeURIComponent(`{${fieldName}}='${escapeFormulaValue(agentCode)}'`)}`;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(agentsTable)}?${filter}&maxRecords=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { records: Array<{ fields: Record<string, unknown> }> };
  const record = json.records?.[0];
  if (!record) return null;
  return buildAgentProfile(record.fields || {});
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

export function toPublicRow(r: LoyaltyRow): PublicLoyaltyRow | null {
  const f = r.fields || {};
  if (typeof f.points !== 'number' || !f.type || !f.rule_code || !f.status) return null;
  return {
    id: r.id,
    createdTime: r.createdTime,
    earned_at: f.earned_at,
    points: f.points,
    type: f.type,
    type_display_name: typeof f.type_display_name === 'string' ? f.type_display_name : undefined,
    rule_code: f.rule_code,
    status: f.status,
    expires_at: f.expires_at,
    source_txn: f.source_txn,
    source_channel: f.source_channel,
    description_display_name:
      typeof f.description_display_name === 'string' ? f.description_display_name : undefined,
  };
}

export type CatalogueFields = {
  name?: string;
  price_aed?: number;
  points?: number;
  Link?: string;
  display_rank?: number;
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
  Picture?: Array<{ url: string; thumbnails?: { large?: { url?: string }; small?: { url?: string } } }>;
};

export type CatalogueUnitAllocation = {
  id: string;
  catalogueId: string | null;
  unitType: string | null;
  maxStock: number | null;
  points: number | null;
  pictureUrl: string | null;
};

export type CatalogueItemWithAllocations = CatalogueItem & {
  unitAllocations: CatalogueUnitAllocation[];
};


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

    const res = await fetch(`${urlBase}?${params.toString()}`, {
      headers,
      cache: 'no-store',
    });
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
