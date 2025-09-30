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
          className="w-full rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] px-4 py-3 text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] sm:flex sm:h-full sm:flex-col sm:justify-between sm:px-6 sm:py-6 xl:max-w-[280px]"
        >
          <div>
            <p className="text-sm font-semibold text-[var(--color-outer-space)]/70 sm:text-base">
              {item.label}
            </p>
            <p className="pt-3 text-2xl font-semibold text-[var(--color-outer-space)] sm:pt-4 sm:text-[32px]">
              {formatPoints(item.points)} pts
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
