import React from 'react';
import type { PublicLoyaltyRow } from '@/lib/airtable';
import { EmptyState } from './EmptyState';
import { formatDate, formatPoints } from '@/lib/format';

export function ActivityTable({ rows }: { rows: PublicLoyaltyRow[] }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="Start building your trail"
        description="Close your first deal, redeem a reward, or invite an investor to see your activity light up here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#d1b7fb] bg-[var(--color-background)]">
      <div className="hidden sm:block">
        <table className="min-w-full text-sm">
          <thead className="bg-[rgba(234,213,254,0.5)] text-left text-xs font-semibold text-[var(--color-outer-space)]/70">
            <tr>
              <th className="px-5 py-4">When</th>
              <th className="px-5 py-4">Type</th>
              <th className="px-5 py-4">Description</th>
              <th className="px-5 py-4 text-right">Points</th>
            </tr>
          </thead>
          <tbody className="stagger-fade">
            {rows.map((r) => {
              const dateLabel = formatDate(r.earned_at ?? r.createdTime);
              const typeLabel = r.type_display_name
                ? r.type_display_name
                : r.type
                    .split('_')
                    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                    .join(' ');
              const descriptionLabel = r.description_display_name?.trim() || '—';
              const positive = r.points >= 0;
              return (
                <tr key={r.id} className="bg-[var(--color-background)] transition hover:bg-[rgba(234,213,254,0.35)]">
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-[var(--color-outer-space)]/70">{dateLabel}</td>
                  <td className="px-5 py-4 text-base font-semibold text-[var(--color-outer-space)]">{typeLabel}</td>
                  <td className="px-5 py-4 text-sm text-[var(--color-outer-space)]/70">{descriptionLabel}</td>
                <td
                  className={`whitespace-nowrap px-5 py-4 text-right text-base font-semibold tabular-nums ${
                    positive ? 'text-[var(--color-success)]' : 'text-rose-500'
                  }`}
                >
                  {formatPoints(r.points)} pts
                </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[#d1b7fb]/40 bg-[var(--color-background)] sm:hidden stagger-fade">
        {rows.map((r) => {
          const dateLabel = formatDate(r.earned_at ?? r.createdTime);
          const typeLabel = r.type_display_name
            ? r.type_display_name
            : r.type
                .split('_')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');
          const descriptionLabel = r.description_display_name?.trim() || '—';
          const positive = r.points >= 0;
          return (
            <div key={r.id} className="grid gap-1 px-4 py-4 text-[var(--color-outer-space)]">
              <div className="flex items-center justify-between text-xs text-[var(--color-outer-space)]/60">
                <span>{dateLabel}</span>
                <span className={`font-semibold ${positive ? 'text-[var(--color-success)]' : 'text-rose-500'}`}>
                  {formatPoints(r.points)} pts
                </span>
              </div>
              <p className="text-sm font-semibold">{typeLabel}</p>
              <p className="text-xs text-[var(--color-outer-space)]/70">{descriptionLabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
