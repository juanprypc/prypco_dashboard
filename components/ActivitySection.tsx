'use client';

import React from 'react';
import type { PublicLoyaltyRow } from '@/lib/airtable';
import { ActivityTable } from './ActivityTable';

export default function ActivitySection({
  rows,
  loading,
}: {
  rows: PublicLoyaltyRow[] | null;
  loading: boolean;
}) {
  if (loading && (!rows || rows.length === 0)) {
    return (
      <div className="space-y-3 stagger-fade">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-[20px] border border-[#d1b7fb]/50 bg-[var(--color-panel-soft)] px-4 py-3 shadow-sm animate-pulse"
          >
            <div className="h-3 w-24 rounded-full bg-[#d1b7fb]/70" />
            <div className="h-3 w-16 rounded-full bg-[#d1b7fb]/50" />
          </div>
        ))}
      </div>
    );
  }

  return <ActivityTable rows={rows ?? []} />;
}
