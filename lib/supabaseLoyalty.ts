import { getSupabaseAdminClient } from '@/lib/supabaseClient';
import type { PublicLoyaltyRow } from '@/lib/airtable';

type AgentProfileRow = {
  id: string;
  code: string | null;
  display_name: string | null;
  investor_promo_code: string | null;
  investor_whatsapp_link: string | null;
  p1_referral_link: string | null;
  p1_whatsapp_link: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export type SupabaseLoyaltyPointRow = {
  id: string;
  agent_id: string | null;
  agent_code: string | null;
  agent_display_name: string | null;
  points: number;
  type: string;
  type_display_name: string | null;
  rule_code: string;
  status: string;
  description_display_name: string | null;
  earned_at: string | null;
  expires_at: string | null;
  source_txn: string[] | null;
  source_channel: string[] | null;
  created_time: string;
};

export type SupabaseAgentProfile = {
  displayName: string | null;
  investorPromoCode: string | null;
  investorWhatsappLink: string | null;
  referralLink: string | null;
  referralWhatsappLink: string | null;
  code: string | null;
  id: string;
};

export type SupabaseMonthlyPointRow = {
  agent_id: string;
  month: string;
  positive_points: number;
  negative_points: number;
  total_transactions: number;
};

export type LoyaltyMonthlySummary = {
  month: string;
  positivePoints: number;
  negativePoints: number;
  totalTransactions: number;
};

const supabase = getSupabaseAdminClient();

function normaliseCode(value: string): string {
  return value.trim();
}

export async function fetchAgentProfileById(id: string): Promise<SupabaseAgentProfile | null> {
  const { data, error } = await supabase
    .from('agent_profiles')
    .select(
      'id, code, display_name, investor_promo_code, investor_whatsapp_link, p1_referral_link, p1_whatsapp_link, updated_at, created_at',
    )
    .eq('id', id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapAgentProfileRow(data as AgentProfileRow);
}

export async function fetchAgentProfileByCode(code: string): Promise<SupabaseAgentProfile | null> {
  const trimmed = normaliseCode(code);
  const { data, error } = await supabase
    .from('agent_profiles')
    .select(
      'id, code, display_name, investor_promo_code, investor_whatsapp_link, p1_referral_link, p1_whatsapp_link, updated_at, created_at',
    )
    .ilike('code', trimmed)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapAgentProfileRow(data as AgentProfileRow);
}

function mapAgentProfileRow(row: AgentProfileRow): SupabaseAgentProfile {
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    investorPromoCode: row.investor_promo_code,
    investorWhatsappLink: row.investor_whatsapp_link,
    referralLink: row.p1_referral_link,
    referralWhatsappLink: row.p1_whatsapp_link,
  };
}

type FetchLoyaltyOptions = {
  agentId?: string;
  agentCode?: string;
  includeExpired?: boolean;
};

export async function fetchLoyaltyPointRows({
  agentId,
  agentCode,
  includeExpired = false,
}: FetchLoyaltyOptions): Promise<SupabaseLoyaltyPointRow[]> {
  if (!agentId && !agentCode) {
    return [];
  }

  let query = supabase
    .from('loyalty_points')
    .select(
      'id, agent_id, agent_code, agent_display_name, points, type, type_display_name, rule_code, status, description_display_name, earned_at, expires_at, source_txn, source_channel, created_time',
    )
    .eq('status', 'posted')
    .order('created_time', { ascending: false });

  if (agentId) {
    query = query.eq('agent_id', agentId);
  } else if (agentCode) {
    query = query.ilike('agent_code', normaliseCode(agentCode));
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as SupabaseLoyaltyPointRow[] | null) ?? [];
  if (includeExpired) return rows;
  return rows.filter(isNotExpired);
}

export async function fetchAllPostedLoyaltyPointsRaw(includeExpired = false): Promise<SupabaseLoyaltyPointRow[]> {
  const query = supabase
    .from('loyalty_points')
    .select(
      'id, agent_id, agent_code, agent_display_name, points, type, type_display_name, rule_code, status, description_display_name, earned_at, expires_at, source_txn, source_channel, created_time',
    )
    .eq('status', 'posted')
    .order('created_time', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as SupabaseLoyaltyPointRow[] | null) ?? [];
  if (includeExpired) return rows;
  return rows.filter(isNotExpired);
}

export async function fetchMonthlySummaries(agentId: string, limit = 12): Promise<LoyaltyMonthlySummary[]> {
  if (!agentId) return [];
  const { data, error } = await supabase
    .from('loyalty_points_monthly')
    .select('agent_id, month, positive_points, negative_points, total_transactions')
    .eq('agent_id', agentId)
    .order('month', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data as SupabaseMonthlyPointRow[] | null) ?? []).map(mapMonthlyRow);
}

export function mapLoyaltyPointRow(row: SupabaseLoyaltyPointRow): PublicLoyaltyRow | null {
  if (row.points === null || row.type === null || row.rule_code === null || row.status === null) {
    return null;
  }

  return {
    id: row.id,
    createdTime: row.created_time,
    earned_at: row.earned_at ?? undefined,
    points: row.points,
    type: row.type,
    type_display_name: row.type_display_name ?? undefined,
    rule_code: row.rule_code,
    status: row.status,
    expires_at: row.expires_at ?? undefined,
    source_txn: row.source_txn ?? undefined,
    source_channel: row.source_channel ?? undefined,
    description_display_name: row.description_display_name ?? undefined,
  };
}

export function mapLoyaltyPointsToPublic(rows: SupabaseLoyaltyPointRow[]): PublicLoyaltyRow[] {
  return rows.map(mapLoyaltyPointRow).filter((row): row is PublicLoyaltyRow => row !== null);
}

function mapMonthlyRow(row: SupabaseMonthlyPointRow): LoyaltyMonthlySummary {
  return {
    month: row.month,
    positivePoints: row.positive_points ?? 0,
    negativePoints: row.negative_points ?? 0,
    totalTransactions: row.total_transactions ?? 0,
  };
}

function isNotExpired(row: SupabaseLoyaltyPointRow): boolean {
  if (!row.expires_at) return true;
  const expiresAt = Date.parse(row.expires_at);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt >= Date.now();
}
