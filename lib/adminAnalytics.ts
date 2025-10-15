import { getSupabaseAdminClient } from '@/lib/supabaseClient';

export type AdminOverview = {
  total_positive_points: number;
  total_negative_points: number;
  net_points: number;
  issued_this_month: number;
  redeemed_this_month: number;
  liability_expiring_30: number;
  liability_expiring_60: number;
  liability_expiring_90: number;
  total_cost_aed: number;
  issued_this_month_cost_aed: number;
  total_deal_value_aed: number | null;
  issued_this_month_deal_value_aed: number | null;
};

export type AdminChannelRow = {
  channel: string;
  positive_points: number;
  negative_points: number;
  net_points: number;
  transaction_count: number;
  agent_count: number;
  expiring_30: number;
  expiring_60: number;
  expiring_90: number;
  points_cost_aed: number;
  deal_value_aed: number | null;
};

export type AdminMonthlyRow = {
  month_start: string;
  channel: string;
  positive_points: number;
  negative_points: number;
  net_points: number;
  points_cost_aed: number;
  deal_value_aed: number | null;
};

export type AdminAnalytics = {
  overview: AdminOverview;
  channels: AdminChannelRow[];
  monthly: AdminMonthlyRow[];
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

export async function fetchAdminAnalytics(pointsPerAed: number, months = 12): Promise<AdminAnalytics> {
  // Supabase RPC generics are unavailable without generated types, so fall back to `any` for the call site only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseAdminClient() as any;

  const { data: overviewData, error: overviewError } = await supabase.rpc('loyalty_admin_overview', {
    points_per_aed: pointsPerAed,
  });
  if (overviewError) throw overviewError;
  const overviewRow = Array.isArray(overviewData) && overviewData.length > 0 ? overviewData[0] : {};

  const overview: AdminOverview = {
    total_positive_points: toNumber((overviewRow as Record<string, unknown>).total_positive_points),
    total_negative_points: toNumber((overviewRow as Record<string, unknown>).total_negative_points),
    net_points: toNumber((overviewRow as Record<string, unknown>).net_points),
    issued_this_month: toNumber((overviewRow as Record<string, unknown>).issued_this_month),
    redeemed_this_month: toNumber((overviewRow as Record<string, unknown>).redeemed_this_month),
    liability_expiring_30: toNumber((overviewRow as Record<string, unknown>).liability_expiring_30),
    liability_expiring_60: toNumber((overviewRow as Record<string, unknown>).liability_expiring_60),
    liability_expiring_90: toNumber((overviewRow as Record<string, unknown>).liability_expiring_90),
    total_cost_aed: toNumber((overviewRow as Record<string, unknown>).total_cost_aed),
    issued_this_month_cost_aed: toNumber((overviewRow as Record<string, unknown>).issued_this_month_cost_aed),
    total_deal_value_aed: toNullableNumber((overviewRow as Record<string, unknown>).total_deal_value_aed),
    issued_this_month_deal_value_aed: toNullableNumber(
      (overviewRow as Record<string, unknown>).issued_this_month_deal_value_aed,
    ),
  };

  const { data: channelData, error: channelError } = await supabase.rpc('loyalty_admin_channel_breakdown', {
    points_per_aed: pointsPerAed,
  });
  if (channelError) throw channelError;
  const channelRows = Array.isArray(channelData) ? channelData : [];

  const channels: AdminChannelRow[] = channelRows.map((raw: Record<string, unknown>) => ({
    channel: typeof raw.channel === 'string' && raw.channel.trim() ? raw.channel : 'Unattributed',
    positive_points: toNumber(raw.positive_points),
    negative_points: toNumber(raw.negative_points),
    net_points: toNumber(raw.net_points),
    transaction_count: toNumber(raw.transaction_count),
    agent_count: toNumber(raw.agent_count),
    expiring_30: toNumber(raw.expiring_30),
    expiring_60: toNumber(raw.expiring_60),
    expiring_90: toNumber(raw.expiring_90),
    points_cost_aed: toNumber(raw.points_cost_aed),
    deal_value_aed: toNullableNumber(raw.deal_value_aed),
  }));

  const { data: monthlyData, error: monthlyError } = await supabase.rpc('loyalty_admin_monthly', {
    points_per_aed: pointsPerAed,
    months,
  });
  if (monthlyError) throw monthlyError;
  const monthlyRows = Array.isArray(monthlyData) ? monthlyData : [];

  const monthly: AdminMonthlyRow[] = monthlyRows.map((raw: Record<string, unknown>) => ({
    month_start: typeof raw.month_start === 'string' ? raw.month_start : '',
    channel: typeof raw.channel === 'string' && raw.channel.trim() ? raw.channel : 'Unattributed',
    positive_points: toNumber(raw.positive_points),
    negative_points: toNumber(raw.negative_points),
    net_points: toNumber(raw.net_points),
    points_cost_aed: toNumber(raw.points_cost_aed),
    deal_value_aed: toNullableNumber(raw.deal_value_aed),
  }));

  return { overview, channels, monthly };
}
