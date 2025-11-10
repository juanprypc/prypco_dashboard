'use client';

import { useState } from 'react';
import { DamacMapSelector } from '@/components/redeem';

export default function TestDamacMapPage() {
  const [catalogueId, setCatalogueId] = useState('');
  const [catalogueInput, setCatalogueInput] = useState('');
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);

  const handleApply = () => {
    setCatalogueId(catalogueInput.trim());
    setSelectedAllocationId(null);
  };

  return (
    <div className="min-h-screen bg-[var(--color-desert-dust)]/30 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="rounded-[28px] border border-[#d1b7fb] bg-white p-6 shadow-lg">
          <h1 className="text-2xl font-bold text-[var(--color-outer-space)]">
            DAMAC Map Selector · Test Page
          </h1>
          <p className="mt-2 text-sm text-[var(--color-outer-space)]/70">
            Leave blank to view all allocations, or enter a catalogue ID to filter
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">
              Catalogue ID
              <input
                type="text"
                value={catalogueInput}
                onChange={(e) => setCatalogueInput(e.target.value)}
                placeholder="recXXXXXXXXXXXXXX"
                className="mt-2 w-full rounded-[16px] border border-[var(--color-outer-space)]/15 bg-white px-3 py-3 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
              />
            </label>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-full bg-[var(--color-outer-space)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#150f4c] sm:w-auto"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Component */}
        <DamacMapSelector
          catalogueId={catalogueId}
          selectedAllocationId={selectedAllocationId}
          onSelectAllocation={setSelectedAllocationId}
        />

        {/* Debug Info */}
        <div className="rounded-[28px] border border-[#d1b7fb]/60 bg-white p-4 shadow">
          <p className="text-sm font-semibold text-[var(--color-outer-space)]">Selection State</p>
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-outer-space)]/60">
              Selected Allocation
            </p>
            <p className="text-base font-medium text-[var(--color-outer-space)]">
              {selectedAllocationId || 'None'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
