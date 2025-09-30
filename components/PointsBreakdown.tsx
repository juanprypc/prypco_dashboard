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
    <div className="grid auto-rows-max grid-cols-1 gap-3 sm:auto-rows-fr sm:grid-cols-2 sm:gap-4 xl:auto-rows-fr xl:grid-cols-3 xl:gap-5 xl:justify-items-center">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex w-full flex-col gap-3 rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] p-4 text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] sm:h-full sm:min-h-[200px] sm:gap-4 sm:p-6 xl:max-w-[280px]"
        >
          <p className="text-sm font-semibold text-[var(--color-outer-space)]/70 sm:text-base">
            {item.label}
          </p>
          <p className="text-2xl font-semibold text-[var(--color-outer-space)] sm:mt-auto sm:text-[32px]">
            {formatPoints(item.points)} pts
          </p>
        </div>
      ))}
    </div>
  );
}
