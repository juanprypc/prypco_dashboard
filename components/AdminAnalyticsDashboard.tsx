'use client';

import { useMemo } from 'react';
import { KpiCard } from '@/components/KpiCard';
import { Sparkline } from '@/components/Sparkline';
import type { AdminAnalyticsPayload, AdminChannelBreakdown, AdminMonthlyRow } from '@/lib/adminAnalytics';
import { formatNumber, formatPoints } from '@/lib/format';

type Props = {
  data: AdminAnalyticsPayload;
  generatedAt: string;
  pointsPerAed: number;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'AED',
  maximumFractionDigits: 2,
});

const percentageFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return 'AED 0';
  return currencyFormatter.format(value);
}

function formatPercent(value: number | null): string {
  if (!value || !Number.isFinite(value)) return '—';
  return percentageFormatter.format(value);
}

function buildSparklineData(monthly: AdminMonthlyRow[]) {
  const aggregates = new Map<string, { label: string; value: number }>();
  for (const row of monthly) {
    if (!row.month_start) continue;
    const key = row.month_start;
    const label = monthFormatter.format(new Date(row.month_start));
    const entry = aggregates.get(key) ?? { label, value: 0 };
    entry.value += row.net_points;
    aggregates.set(key, entry);
  }
  return Array.from(aggregates.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([, value]) => value);
}

function computeChannelShare(channels: AdminChannelBreakdown[]) {
  const totalPositive = channels.reduce((sum, channel) => sum + channel.positive_points, 0);
  return channels.map((channel) => ({
    ...channel,
    share: totalPositive > 0 ? channel.positive_points / totalPositive : 0,
  }));
}

export function AdminAnalyticsDashboard({ data, generatedAt, pointsPerAed }: Props) {
  const { overview, channels, monthly } = data;

  const netLiabilityCost = overview.net_points > 0 ? overview.net_points / Math.max(pointsPerAed, 1) : 0;

  const sparklineData = useMemo(() => buildSparklineData(monthly), [monthly]);
  const sparklineMax = useMemo(() => {
    if (!sparklineData.length) return 1;
    return Math.max(...sparklineData.map((entry) => Math.abs(entry.value)), 1);
  }, [sparklineData]);
  const channelRows = useMemo(() => computeChannelShare(channels), [channels]);

  const totalIssuedCost = overview.total_cost_aed;
  const totalDealValue = overview.total_deal_value_aed ?? 0;
  const overallTakeRate =
    totalDealValue > 0 && totalIssuedCost > 0 ? Math.min(totalIssuedCost / totalDealValue, 1) : null;

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-[var(--color-outer-space)]">Collect Analytics</h1>
        <p className="text-sm text-[var(--color-outer-space)]/70">
          Generated {new Date(generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. Points cost assumes {formatNumber(pointsPerAed)} pts per AED.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total points issued" value={overview.total_positive_points} unit="pts" animate />
        <KpiCard title="Total points redeemed" value={Math.abs(overview.total_negative_points)} unit="pts" animate />
        <KpiCard
          title="Outstanding liability"
          value={overview.net_points}
          unit="pts"
          note={`≈ ${formatCurrency(netLiabilityCost)}`}
          animate
        />
        <KpiCard
          title="Issued this month"
          value={overview.issued_this_month}
          unit="pts"
          note={`≈ ${formatCurrency(overview.issued_this_month_cost_aed)}`}
          animate
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[28px] border border-[#d1b7fb]/80 bg-white p-6 shadow-[0_28px_70px_-65px_rgba(13,9,59,0.6)]">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-outer-space)]">Business unit breakdown</h2>
              <p className="text-xs text-[var(--color-outer-space)]/60">
                Issued vs redeemed points and expiring liability per source channel.
              </p>
            </div>
            <div className="hidden text-right text-xs text-[var(--color-outer-space)]/50 sm:block">
              <p>Total cost distributed</p>
              <p className="font-semibold text-[var(--color-outer-space)]">{formatCurrency(totalIssuedCost)}</p>
            </div>
          </header>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[rgba(234,213,254,0.45)] text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-outer-space)]/70">
                <tr>
                  <th className="px-3 py-2">Business unit</th>
                  <th className="px-3 py-2 text-right">Issued</th>
                  <th className="px-3 py-2 text-right">Redeemed</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">Cost (AED)</th>
                  <th className="px-3 py-2 text-right">Take rate</th>
                  <th className="px-3 py-2 text-right">Txns</th>
                  <th className="px-3 py-2 text-right">Agents</th>
                  <th className="px-3 py-2 text-right">Expiring 30</th>
                  <th className="px-3 py-2 text-right">Expiring 60</th>
                  <th className="px-3 py-2 text-right">Expiring 90</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d1b7fb]/40">
                {channelRows.map((channel) => {
                  const takeRate =
                    channel.deal_value_aed && channel.deal_value_aed > 0
                      ? Math.min(channel.points_cost_aed / channel.deal_value_aed, 1)
                      : null;
                  return (
                    <tr key={channel.channel} className="hover:bg-[rgba(234,213,254,0.18)]">
                      <td className="px-3 py-3 text-sm font-semibold text-[var(--color-outer-space)]">
                        <div className="flex items-center gap-3">
                          <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-electric-purple)]/70" />
                          <span>{channel.channel}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--color-panel)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-electric-purple)]/60"
                            style={{ width: `${Math.min(channel.share * 100, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-[var(--color-outer-space)]">
                        {formatPoints(channel.positive_points)}
                      </td>
                      <td className="px-3 py-3 text-right text-rose-500">
                        {formatPoints(Math.abs(channel.negative_points))}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-[var(--color-outer-space)]">
                        {formatPoints(channel.net_points)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/80">
                        {formatCurrency(channel.points_cost_aed)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/80">
                        {formatPercent(takeRate)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/80">
                        {formatNumber(channel.transaction_count)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/80">
                        {formatNumber(channel.agent_count)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/70">
                        {formatPoints(channel.expiring_30)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/70">
                        {formatPoints(channel.expiring_60)}
                      </td>
                      <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/70">
                        {formatPoints(channel.expiring_90)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="flex h-full flex-col rounded-[28px] border border-[#d1b7fb]/70 bg-white p-6 shadow-[0_28px_70px_-65px_rgba(13,9,59,0.6)]">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-outer-space)]">Overall take rate</h2>
            <p className="text-sm text-[var(--color-outer-space)]/60">
              Ratio of loyalty spend to deal value across all channels.
            </p>
            <div className="text-3xl font-semibold text-[var(--color-outer-space)]">
              {formatPercent(overallTakeRate)}
              {overallTakeRate === null ? (
                <span className="mt-1 block text-xs font-normal text-[var(--color-outer-space)]/50">
                  Provide deal values to enable take rate measurement.
                </span>
              ) : (
                <span className="mt-1 block text-xs font-normal text-[var(--color-outer-space)]/60">
                  Total spend {formatCurrency(totalIssuedCost)} vs {formatCurrency(totalDealValue)}
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-1 flex-col gap-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-outer-space)]/60">
                Liability expiring
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-[var(--color-outer-space)]/80">
                <li className="flex items-center justify-between">
                  <span>Next 30 days</span>
                  <span className="font-semibold">{formatPoints(overview.liability_expiring_30)} pts</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>31-60 days</span>
                  <span className="font-semibold">{formatPoints(overview.liability_expiring_60)} pts</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>61-90 days</span>
                  <span className="font-semibold">{formatPoints(overview.liability_expiring_90)} pts</span>
                </li>
              </ul>
            </div>

            <div className="rounded-[20px] border border-[#d1b7fb]/60 bg-[var(--color-panel)]/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-outer-space)]/60">
                    Net points trend
                  </h3>
                  <p className="text-[11px] text-[var(--color-outer-space)]/50">Past {sparklineData.length} months</p>
                </div>
                <span className="text-sm font-semibold text-[var(--color-outer-space)]">
                  {sparklineData.at(-1)?.value
                    ? `${formatNumber(sparklineData.at(-1)?.value ?? 0)} pts`
                    : '—'}
                </span>
              </div>
              <div className="mt-3 overflow-hidden rounded-[18px] bg-white p-2">
                <Sparkline data={sparklineData} />
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-[28px] border border-[#d1b7fb]/70 bg-white p-6 shadow-[0_28px_70px_-65px_rgba(13,9,59,0.6)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-outer-space)]">Monthly issuance vs redemption</h2>
            <p className="text-xs text-[var(--color-outer-space)]/60">
              Aggregated across all business units. Positive bars = points issued; negative = redeemed.
            </p>
          </div>
        </header>

        <div className="mt-4 space-y-3">
          {sparklineData.map((entry) => (
            <div key={entry.label} className="grid grid-cols-[120px_1fr_120px] items-center gap-3 text-sm">
              <span className="font-medium text-[var(--color-outer-space)]">{entry.label}</span>
              <div className="h-2 rounded-full bg-[var(--color-panel)]">
                <div
                  className={`h-full rounded-full ${
                    entry.value >= 0 ? 'bg-[var(--color-electric-purple)]' : 'bg-rose-400'
                  }`}
                  style={{ width: `${Math.min(Math.abs(entry.value) / sparklineMax, 1) * 100}%` }}
                />
              </div>
              <span
                className={`justify-self-end font-semibold ${
                  entry.value >= 0 ? 'text-[var(--color-outer-space)]' : 'text-rose-500'
                }`}
              >
                {formatPoints(entry.value)} pts
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
