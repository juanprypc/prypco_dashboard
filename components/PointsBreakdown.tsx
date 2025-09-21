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
    <div className="grid grid-cols-3 gap-2 sm:gap-4 xl:gap-5">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex h-full flex-col justify-between rounded-[20px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] p-3 text-[var(--color-outer-space)] sm:rounded-[28px] sm:p-6"
        >
          <p className="text-xs font-semibold text-[var(--color-outer-space)]/70 sm:text-base">
            {item.label}
          </p>
          <p className="mt-2 text-[20px] font-semibold text-[var(--color-outer-space)] sm:mt-4 sm:text-[28px]">
            {formatPoints(item.points)} pts
          </p>
        </div>
      ))}
    </div>
  );
}
