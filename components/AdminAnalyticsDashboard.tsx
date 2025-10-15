import type { AdminAnalytics } from '@/lib/adminAnalytics';
import { formatNumber, formatPoints } from '@/lib/format';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'AED',
  maximumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

function formatCurrency(value: number | null): string {
  if (!value || !Number.isFinite(value)) return 'AED 0';
  return currencyFormatter.format(value);
}

type Props = {
  data: AdminAnalytics;
  generatedAt: string;
  pointsPerAed: number;
};

type SparkPoint = {
  label: string;
  value: number;
};

export function AdminAnalyticsDashboard({ data, generatedAt, pointsPerAed }: Props) {
  const { overview, channels, monthly } = data;
  const netCost = overview.net_points > 0 ? overview.net_points / Math.max(pointsPerAed, 1) : 0;

  const overallTakeRate =
    overview.total_deal_value_aed && overview.total_deal_value_aed > 0
      ? Math.min(overview.total_cost_aed / overview.total_deal_value_aed, 1)
      : null;

  const monthlyByMonth = new Map<string, { issued: number; redeemed: number }>();
  for (const row of monthly) {
    const monthKey = row.month_start;
    if (!monthKey) continue;
    const record = monthlyByMonth.get(monthKey) ?? { issued: 0, redeemed: 0 };
    if (row.positive_points > 0) record.issued += row.positive_points;
    if (row.negative_points < 0) record.redeemed += Math.abs(row.negative_points);
    monthlyByMonth.set(monthKey, record);
  }
  const monthlyTrend = Array.from(monthlyByMonth.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .slice(-12);

  const sparklineData: SparkPoint[] = monthlyTrend.map(([month, totals]) => ({
    label: monthFormatter.format(new Date(month)),
    value: totals.issued - totals.redeemed,
  }));

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-[var(--color-outer-space)]">Collect Analytics</h1>
        <p className="text-sm text-[var(--color-outer-space)]/60">
          Generated {new Date(generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. Points
          cost assumes {formatNumber(pointsPerAed)} pts per AED.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total points issued"
          primary={`${formatPoints(overview.total_positive_points)} pts`}
          secondary={`Cost ${formatCurrency(overview.total_cost_aed)}`}
        />
        <StatCard
          title="Total points redeemed"
          primary={`${formatPoints(Math.abs(overview.total_negative_points))} pts`}
          secondary={`${formatNumber(overview.redeemed_this_month)} pts redeemed this month`}
        />
        <StatCard
          title="Outstanding liability"
          primary={`${formatPoints(overview.net_points)} pts`}
          secondary={`≈ ${formatCurrency(netCost)}`}
        />
        <StatCard
          title="Issued this month"
          primary={`${formatPoints(overview.issued_this_month)} pts`}
          secondary={`≈ ${formatCurrency(overview.issued_this_month_cost_aed)}`}
        />
      </section>

      <section className="rounded-[28px] border border-[#d1b7fb]/80 bg-white p-6 shadow-[0_28px_70px_-65px_rgba(13,9,59,0.6)]">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-outer-space)]">Business unit breakdown</h2>
            <p className="text-xs text-[var(--color-outer-space)]/60">
              Issued, redeemed, and expiring points grouped by `source_channel`.
            </p>
          </div>
          <div className="text-right text-xs text-[var(--color-outer-space)]/60">
            <p>Total cost distributed</p>
            <p className="text-sm font-semibold text-[var(--color-outer-space)]">
              {formatCurrency(overview.total_cost_aed)}
            </p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[rgba(234,213,254,0.45)] text-left text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-outer-space)]/70">
              <tr>
                <th className="px-3 py-2">Business Unit</th>
                <th className="px-3 py-2 text-right">Issued</th>
                <th className="px-3 py-2 text-right">Redeemed</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">Cost (AED)</th>
                <th className="px-3 py-2 text-right">Take Rate</th>
                <th className="px-3 py-2 text-right">Transactions</th>
                <th className="px-3 py-2 text-right">Agents</th>
                <th className="px-3 py-2 text-right">Expiring 30</th>
                <th className="px-3 py-2 text-right">Expiring 60</th>
                <th className="px-3 py-2 text-right">Expiring 90</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d1b7fb]/40">
              {channels.map((channel) => {
                const takeRate =
                  channel.deal_value_aed && channel.deal_value_aed > 0
                    ? Math.min(channel.points_cost_aed / channel.deal_value_aed, 1)
                    : null;
                return (
                  <tr key={channel.channel} className="hover:bg-[rgba(234,213,254,0.18)]">
                    <td className="px-3 py-3 font-semibold text-[var(--color-outer-space)]">{channel.channel}</td>
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
                    <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/70">
                      {takeRate === null ? 'No data' : `${(takeRate * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/70">
                      {formatNumber(channel.transaction_count)}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/70">
                      {formatNumber(channel.agent_count)}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/60">
                      {formatPoints(channel.expiring_30)}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/60">
                      {formatPoints(channel.expiring_60)}
                    </td>
                    <td className="px-3 py-3 text-right text-[var(--color-outer-space)]/60">
                      {formatPoints(channel.expiring_90)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-[28px] border border-[#d1b7fb]/80 bg-white p-6 shadow-[0_28px_70px_-65px_rgba(13,9,59,0.6)]">
          <h2 className="text-lg font-semibold text-[var(--color-outer-space)]">Monthly trend</h2>
          <p className="text-xs text-[var(--color-outer-space)]/60">
            Net points (issued minus redeemed) over the last 12 months.
          </p>
          <div className="mt-6 rounded-[24px] border border-[#d1b7fb]/70 bg-[var(--color-panel)]/70 p-5">
            {sparklineData.length ? (
              <Sparkline points={sparklineData} />
            ) : (
              <p className="text-sm text-[var(--color-outer-space)]/60">No trend data available yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-[#d1b7fb]/80 bg-white p-6 shadow-[0_28px_70px_-65px_rgba(13,9,59,0.6)]">
          <h2 className="text-lg font-semibold text-[var(--color-outer-space)]">Liability runway</h2>
          <p className="text-xs text-[var(--color-outer-space)]/60">Points scheduled to expire in the next 90 days.</p>
          <ul className="mt-4 space-y-3 text-sm text-[var(--color-outer-space)]/80">
            <li className="flex items-center justify-between">
              <span>0 - 30 days</span>
              <span className="font-semibold text-[var(--color-outer-space)]">
                {formatPoints(overview.liability_expiring_30)} pts
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>31 - 60 days</span>
              <span className="font-semibold text-[var(--color-outer-space)]">
                {formatPoints(overview.liability_expiring_60)} pts
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>61 - 90 days</span>
              <span className="font-semibold text-[var(--color-outer-space)]">
                {formatPoints(overview.liability_expiring_90)} pts
              </span>
            </li>
          </ul>

          <div className="mt-6 rounded-[20px] border border-[#d1b7fb]/60 bg-[var(--color-panel)]/70 p-4 text-xs text-[var(--color-outer-space)]/60">
            <p className="font-semibold uppercase tracking-[0.18em] text-[var(--color-outer-space)]/70">Overall take rate</p>
            <p className="mt-2 text-lg font-semibold text-[var(--color-outer-space)]">
              {overallTakeRate === null ? 'No deal amounts captured' : `${(overallTakeRate * 100).toFixed(2)}%`}
            </p>
            <p className="mt-1">
              Total spend {formatCurrency(overview.total_cost_aed)} vs deal value{' '}
              {formatCurrency(overview.total_deal_value_aed ?? 0)}.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, primary, secondary }: { title: string; primary: string; secondary: string }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-[28px] border border-[#d1b7fb]/60 bg-[radial-gradient(circle_at_top,_rgba(127,90,240,0.18),_rgba(255,255,255,0.95))] p-5 shadow-[0_28px_70px_-65px_rgba(13,9,59,0.55)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-outer-space)]/60">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--color-outer-space)]">{primary}</p>
      <p className="mt-2 text-xs text-[var(--color-outer-space)]/60">{secondary}</p>
    </div>
  );
}

function Sparkline({ points }: { points: SparkPoint[] }) {
  const height = 80;
  const width = Math.max(points.length * 28, 160);
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const coordinates = points.map((point, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * width;
    const normalised = (point.value - min) / range;
    const y = height - normalised * height;
    return { x, y };
  });

  const path = coordinates
    .map((coordinate, index) => `${index === 0 ? 'M' : 'L'}${coordinate.x.toFixed(2)},${coordinate.y.toFixed(2)}`)
    .join(' ');
  const area = `${path} L${coordinates.at(-1)?.x.toFixed(2)},${height} L0,${height} Z`;

  return (
    <div className="space-y-3">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden role="img">
        <path d={area} fill="rgba(127,90,240,0.18)" stroke="none" />
        <path d={path} fill="none" stroke="#7f5af0" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-outer-space)]/60">
        {points.map((point) => (
          <span key={point.label} className="rounded-full bg-white/80 px-2 py-1 shadow-[0_8px_20px_-18px_rgba(13,9,59,0.5)]">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
