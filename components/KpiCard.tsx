import { formatNumber } from '@/lib/format';
import React from 'react';

type Props = {
  title: string;
  value: string | number;
  unit?: string;
  note?: string;
};

export function KpiCard({ title, value, unit, note }: Props) {
  const formatted = typeof value === 'number' ? formatNumber(value) : value;

  return (
    <div className="flex h-full w-full flex-col items-start justify-between rounded-[22px] bg-white/60 shadow-[0_12px_30px_-28px_rgba(13,9,59,0.25)] backdrop-blur-sm p-3 text-left text-[var(--color-outer-space)] sm:rounded-[28px] sm:p-6">
      <p className="text-xs font-normal text-[var(--color-outer-space)]/75 sm:text-xl">{title}</p>
      <div className="mt-2 text-left text-[20px] font-bold leading-[1.08] tracking-tight sm:mt-6 sm:text-[48px]">
        {formatted}
        {unit ? (
          <span className="mt-1 block text-[12px] font-bold text-[var(--color-outer-space)] sm:mt-2 sm:text-[24px]">
            {unit}
          </span>
        ) : null}
      </div>
      {note ? (
        <p className="mt-2 text-[10px] text-[var(--color-outer-space)]/60 sm:mt-4 sm:text-sm">{note}</p>
      ) : null}
    </div>
  );
}
