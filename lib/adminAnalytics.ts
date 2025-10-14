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

export type AdminChannelBreakdown = {
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

export type AdminAnalyticsPayload = {
  overview: AdminOverview;
  channels: AdminChannelBreakdown[];
  monthly: AdminMonthlyRow[];
};

function normaliseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function getAdminAnalytics(pointsPerAed: number, months = 12): Promise<AdminAnalyticsPayload> {
  const supabase = getSupabaseAdminClient();

  const { data: overviewData, error: overviewError } = await supabase.rpc('loyalty_admin_overview', {
    points_per_aed: pointsPerAed,
  });
  if (overviewError) throw overviewError;
  const overviewRow = (overviewData?.[0] ?? {}) as Partial<AdminOverview>;

  const overview: AdminOverview = {
    total_positive_points: normaliseNumber(overviewRow.total_positive_points),
    total_negative_points: normaliseNumber(overviewRow.total_negative_points),
    net_points: normaliseNumber(overviewRow.net_points),
    issued_this_month: normaliseNumber(overviewRow.issued_this_month),
    redeemed_this_month: normaliseNumber(overviewRow.redeemed_this_month),
    liability_expiring_30: normaliseNumber(overviewRow.liability_expiring_30),
    liability_expiring_60: normaliseNumber(overviewRow.liability_expiring_60),
    liability_expiring_90: normaliseNumber(overviewRow.liability_expiring_90),
    total_cost_aed: normaliseNumber(overviewRow.total_cost_aed),
    issued_this_month_cost_aed: normaliseNumber(overviewRow.issued_this_month_cost_aed),
    total_deal_value_aed:
      overviewRow.total_deal_value_aed !== undefined && overviewRow.total_deal_value_aed !== null
        ? normaliseNumber(overviewRow.total_deal_value_aed)
        : null,
    issued_this_month_deal_value_aed:
      overviewRow.issued_this_month_deal_value_aed !== undefined && overviewRow.issued_this_month_deal_value_aed !== null
        ? normaliseNumber(overviewRow.issued_this_month_deal_value_aed)
        : null,
  };

  const { data: channelData, error: channelError } = await supabase.rpc('loyalty_admin_channel_breakdown', {
    points_per_aed: pointsPerAed,
  });
  if (channelError) throw channelError;

  const channels: AdminChannelBreakdown[] =
    channelData?.map((row: Partial<AdminChannelBreakdown>) => ({
      channel: row.channel ?? 'Unattributed',
      positive_points: normaliseNumber(row.positive_points),
      negative_points: normaliseNumber(row.negative_points),
      net_points: normaliseNumber(row.net_points),
      transaction_count: normaliseNumber(row.transaction_count),
      agent_count: normaliseNumber(row.agent_count),
      expiring_30: normaliseNumber(row.expiring_30),
      expiring_60: normaliseNumber(row.expiring_60),
      expiring_90: normaliseNumber(row.expiring_90),
      points_cost_aed: normaliseNumber(row.points_cost_aed),
      deal_value_aed:
        row.deal_value_aed !== undefined && row.deal_value_aed !== null ? normaliseNumber(row.deal_value_aed) : null,
    })) ?? [];

  const { data: monthlyData, error: monthlyError } = await supabase.rpc('loyalty_admin_monthly', {
    points_per_aed: pointsPerAed,
    months,
  });
  if (monthlyError) throw monthlyError;

  const monthly: AdminMonthlyRow[] =
    monthlyData?.map((row: Partial<AdminMonthlyRow>) => ({
      month_start: row.month_start ?? '',
      channel: row.channel ?? 'Unattributed',
      positive_points: normaliseNumber(row.positive_points),
      negative_points: normaliseNumber(row.negative_points),
      net_points: normaliseNumber(row.net_points),
      points_cost_aed: normaliseNumber(row.points_cost_aed),
      deal_value_aed: row.deal_value_aed !== undefined && row.deal_value_aed !== null ? normaliseNumber(row.deal_value_aed) : null,
    })) ?? [];

  return { overview, channels, monthly };
}
