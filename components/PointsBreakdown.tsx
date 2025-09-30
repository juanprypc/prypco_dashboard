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
    <div className="grid auto-rows-max grid-cols-1 gap-3 min-[360px]:auto-rows-fr min-[360px]:grid-cols-2 min-[360px]:gap-4 xl:auto-rows-fr xl:grid-cols-3 xl:gap-5">
      {items.map((item) => (
        <div
          key={item.key}
          className="w-full h-auto min-h-0 rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] p-4 text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] sm:p-6"
        >
          <p className="text-sm font-semibold text-[var(--color-outer-space)]/70 sm:text-base">
            {item.label}
          </p>
          <p className="pt-2 text-2xl font-semibold text-[var(--color-outer-space)] sm:pt-3 sm:text-[32px]">
            {formatPoints(item.points)} pts
          </p>
        </div>
      ))}
    </div>
  );
}
