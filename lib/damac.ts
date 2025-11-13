import type { AirtableRecord } from './airtable';
import { scheduleAirtableRequest } from './airtableRateLimiter';

type EnvName =
  | 'AIRTABLE_API_KEY'
  | 'AIRTABLE_BASE'
  | 'AIRTABLE_TABLE_LOY';

function envVar(name: EnvName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function toMaybeString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === 'string' && obj.value.trim()) return obj.value.trim();
    if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
    if (typeof obj.text === 'string' && obj.text.trim()) return obj.text.trim();
  }
  return undefined;
}

function escapeFormulaValue(value: string): string {
  return value.replace(/'/g, "''");
}

const AIRTABLE_LER_FIELD = (process.env.AIRTABLE_LER_FIELD || 'LER').trim();
let lerFieldUsable = AIRTABLE_LER_FIELD.length > 0;

type DamacRawFields = Record<string, unknown> & {
  unit_alocation_promocode?: string;
  LER?: string;
  agent_email?: string;
  agent_fname?: string;
  agent_code?: string;
  agency_name?: string;
  unit_allocation_fname?: string;
  unit_allocation_phonelast4digit?: string;
  loyalty_unit_allocation?: string;
  damac_island_unit_allocation_redeemed?: boolean | string;
  damac_verified_at?: string;
  damac_verified_by?: string;
  damac_verified_note?: string;
};

export type DamacRedemptionRecord = {
  id: string;
  code: string | null;
  agentEmail: string | null;
  agentName: string | null;
  agentCode: string | null;
  agencyName: string | null;
  unitAllocationFirstName: string | null;
  unitAllocationPhoneLast4: string | null;
  unitAllocationLabel: string | null;
  unitType: string | null;
  redeemed: boolean;
  createdTime: string;
  updatedTime: string | null;
  verifiedBy: string | null;
  verifiedNote: string | null;
};

const DAMAC_BASE_FIELDS = [
  'unit_alocation_promocode',
  'agent_email',
  'agent_fname',
  'agent_code',
  'agency_name',
  'unit_allocation_fname',
  'unit_allocation_phonelast4digit',
  'loyalty_unit_allocation',
  'damac_island_unit_allocation_redeemed',
  'damac_verified_at',
  'damac_verified_by',
  'damac_verified_note',
] as const;

const AIRTABLE_STRING_FORMAT_TIME_ZONE = (process.env.AIRTABLE_TIMEZONE || 'UTC').trim();
const AIRTABLE_STRING_FORMAT_LOCALE = (process.env.AIRTABLE_LOCALE || 'en-US').trim();

function applyStringCellFormatParams(params: URLSearchParams): void {
  params.set('cellFormat', 'string');
  if (!params.has('timeZone')) params.set('timeZone', AIRTABLE_STRING_FORMAT_TIME_ZONE);
  if (!params.has('userLocale')) params.set('userLocale', AIRTABLE_STRING_FORMAT_LOCALE);
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'checked' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function mapRecord(
  record: AirtableRecord<DamacRawFields>,
  unitType: string | null,
): DamacRedemptionRecord {
  const fields = record.fields || {};
  const lerFromDynamicField =
    lerFieldUsable && AIRTABLE_LER_FIELD
      ? toMaybeString((fields as Record<string, unknown>)[AIRTABLE_LER_FIELD])
      : undefined;
  return {
    id: record.id,
    code: lerFromDynamicField ?? toMaybeString(fields.LER) ?? toMaybeString(fields.unit_alocation_promocode) ?? null,
    agentEmail: toMaybeString(fields.agent_email) ?? null,
    agentName: toMaybeString(fields.agent_fname) ?? null,
    agentCode: toMaybeString(fields.agent_code) ?? null,
    agencyName: toMaybeString(fields.agency_name) ?? null,
    unitAllocationFirstName: toMaybeString(fields.unit_allocation_fname) ?? null,
    unitAllocationPhoneLast4: toMaybeString(fields.unit_allocation_phonelast4digit) ?? null,
    unitAllocationLabel: toMaybeString(fields.loyalty_unit_allocation) ?? null,
    unitType,
    redeemed: parseBoolean(fields.damac_island_unit_allocation_redeemed),
    createdTime: record.createdTime,
    updatedTime: toMaybeString(fields.damac_verified_at) ?? null,
    verifiedBy: toMaybeString(fields.damac_verified_by) ?? null,
    verifiedNote: toMaybeString(fields.damac_verified_note) ?? null,
  };
}

async function fetchRedemptionRecords(
  params: URLSearchParams,
  includeLerField: boolean,
): Promise<AirtableRecord<DamacRawFields>[]> {
  const apiKey = envVar('AIRTABLE_API_KEY');
  const baseId = envVar('AIRTABLE_BASE');
  const table = envVar('AIRTABLE_TABLE_LOY');

  const urlBase = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const finalParams = new URLSearchParams(params);
  for (const field of DAMAC_BASE_FIELDS) {
    finalParams.append('fields[]', field);
  }
  if (includeLerField && lerFieldUsable && AIRTABLE_LER_FIELD) {
    finalParams.append('fields[]', AIRTABLE_LER_FIELD);
  }
  applyStringCellFormatParams(finalParams);

  const res = await scheduleAirtableRequest(() =>
    fetch(`${urlBase}?${finalParams.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable redemption error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { records: AirtableRecord<DamacRawFields>[] };
  return json.records ?? [];
}

export async function fetchDamacRedemptionByCode(code: string): Promise<DamacRedemptionRecord | null> {
  const escaped = escapeFormulaValue(code);
  const promoFormula = `{unit_alocation_promocode}='${escaped}'`;
  const lerFormula = `{${AIRTABLE_LER_FIELD}}='${escaped}'`;

  const buildParams = (formula: string) => {
    const params = new URLSearchParams();
    params.set('filterByFormula', formula);
    params.set('maxRecords', '1');
    return params;
  };

  const attemptFetch = async (formula: string, includeLerField: boolean) => {
    const records = await fetchRedemptionRecords(buildParams(formula), includeLerField);
    const record = records[0];
    if (!record) return null;
    const unitType = toMaybeString(record.fields?.loyalty_unit_allocation) ?? null;
    return mapRecord(record, unitType);
  };

  // Always try legacy promo-code lookup first (never errors).
  const promoResult = await attemptFetch(promoFormula, false);
  if (promoResult) return promoResult;

  if (!lerFieldUsable || !AIRTABLE_LER_FIELD) return null;

  try {
    return await attemptFetch(lerFormula, true);
  } catch (error) {
    if (isUnknownFieldError(error)) {
      lerFieldUsable = false;
      return null;
    }
    throw error;
  }
}

export async function fetchDamacRedemptionById(id: string): Promise<DamacRedemptionRecord | null> {
  const apiKey = envVar('AIRTABLE_API_KEY');
  const baseId = envVar('AIRTABLE_BASE');
  const table = envVar('AIRTABLE_TABLE_LOY');
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${id}`;

  const params = new URLSearchParams();
  applyStringCellFormatParams(params);

  const res = await scheduleAirtableRequest(() =>
    fetch(`${url}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable redemption fetch error ${res.status}: ${text}`);
  }

  const record = (await res.json()) as AirtableRecord<DamacRawFields>;
  const unitType = toMaybeString(record.fields?.loyalty_unit_allocation) ?? null;
  return mapRecord(record, unitType);
}

export async function markDamacRedemptionAsRedeemed(
  id: string,
  operatorName: string | null,
  note: string | null,
): Promise<void> {
  const apiKey = envVar('AIRTABLE_API_KEY');
  const baseId = envVar('AIRTABLE_BASE');
  const table = envVar('AIRTABLE_TABLE_LOY');
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${id}`;

  const fields: Record<string, unknown> = {
    damac_island_unit_allocation_redeemed: true,
    damac_verified_at: new Date().toISOString(),
  };
  if (operatorName) fields.damac_verified_by = operatorName;
  if (note) fields.damac_verified_note = note;

  const res = await scheduleAirtableRequest(() =>
    fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    })
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable redemption update error ${res.status}: ${text}`);
  }
}
