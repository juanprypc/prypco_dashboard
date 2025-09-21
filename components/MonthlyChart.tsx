"use client";
import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMonth, formatPoints } from '@/lib/format';
import { EmptyState } from './EmptyState';

export type MonthPoint = { month: string; points: number };

const axisTick = (value: string) => {
  const label = formatMonth(`${value}-01`);
  return label;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string | number;
};

const ChartTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  const total = payload[0]?.value ?? 0;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium text-zinc-600 dark:text-zinc-300">{axisTick(label as string)}</p>
      <p className="mt-1 font-semibold text-indigo-500 dark:text-indigo-300">{formatPoints(total as number)} pts</p>
    </div>
  );
};

export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  if (!data.length) {
    return <EmptyState title="No ledger activity yet" description="Post a deal to see the monthly points trend." />;
  }

  return (
    <div className="h-72 w-full rounded-xl border border-zinc-200 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
          <XAxis dataKey="month" tickFormatter={axisTick} tickLine={false} axisLine={false} dy={6} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatPoints(Number(value))} width={70} />
          <Tooltip cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }} content={<ChartTooltip />} />
          <Bar dataKey="points" fill="url(#pointsGradient)" radius={[6, 6, 0, 0]} />
          <defs>
            <linearGradient id="pointsGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0.2} />
            </linearGradient>
          </defs>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
