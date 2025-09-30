import React from 'react';
import { formatPoints } from '@/lib/format';

type Breakdown = {
  key: string;
  label: string;
  points: number;
  rows: number;
};

export function PointsBreakdown({ items }: { items: Breakdown[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 sm:justify-items-start xl:grid-cols-3 xl:gap-5 xl:justify-items-center">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex h-full min-h-[180px] w-full flex-col justify-between rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] p-4 text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] sm:min-h-[200px] sm:max-w-[280px] sm:p-6"
        >
          <p className="text-sm font-semibold text-[var(--color-outer-space)]/70 sm:text-base">
            {item.label}
          </p>
          <p className="mt-3 text-2xl font-semibold text-[var(--color-outer-space)] sm:mt-4 sm:text-[32px]">
            {formatPoints(item.points)} pts
          </p>
        </div>
      ))}
    </div>
  );
}
