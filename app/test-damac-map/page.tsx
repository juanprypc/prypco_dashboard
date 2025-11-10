'use client';

import { useState, useEffect } from 'react';
import { DamacMapSelector } from '@/components/redeem';

type AllocationDetails = {
  damacIslandcode: string | null;
  points: number | null;
  unitType: string | null;
  brType: string | null;
  availability: string;
};

export default function TestDamacMapPage() {
  const [catalogueId, setCatalogueId] = useState('');
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<AllocationDetails | null>(null);

  // Fetch details when selection changes
  useEffect(() => {
    if (!selectedAllocationId) {
      setSelectedDetails(null);
      return;
    }

    const q = catalogueId ? `?catalogueId=${catalogueId}` : '';
    fetch(`/api/damac/map${q}`)
      .then(r => r.json())
      .then(data => {
        const allocation = data.allocations?.find((a: any) => a.id === selectedAllocationId);
        if (allocation) {
          setSelectedDetails(allocation);
        }
      })
      .catch(err => console.error('Failed to fetch allocation details:', err));
  }, [selectedAllocationId, catalogueId]);

  return (
    <div className="min-h-screen bg-[var(--color-desert-dust)]/30 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Component */}
        <DamacMapSelector
          catalogueId={catalogueId}
          selectedAllocationId={selectedAllocationId}
          onSelectAllocation={setSelectedAllocationId}
        />

        {/* Selection Info - Only shown when something is selected */}
        {selectedAllocationId && selectedDetails && (
          <div className="rounded-[24px] border-2 border-[var(--color-electric-purple)] bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-electric-purple)]">
                  Selected Unit
                </p>
                <h2 className="mt-1 text-2xl font-bold text-[var(--color-outer-space)]">
                  {selectedDetails.damacIslandcode || selectedAllocationId}
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">
                      Points
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[var(--color-outer-space)]">
                      {selectedDetails.points?.toLocaleString() ?? '—'}
                    </p>
                  </div>
                  {selectedDetails.unitType && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">
                        Unit Type
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[var(--color-outer-space)]">
                        {selectedDetails.unitType}
                      </p>
                    </div>
                  )}
                  {selectedDetails.brType && (
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">
                        Bedrooms
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[var(--color-outer-space)]">
                        {selectedDetails.brType}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">
                      Status
                    </p>
                    <span
                      className={
                        'mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ' +
                        (selectedDetails.availability === 'available'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700')
                      }
                    >
                      {selectedDetails.availability}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAllocationId(null)}
                className="rounded-full p-2 text-[var(--color-outer-space)]/40 transition hover:bg-[var(--color-panel)] hover:text-[var(--color-outer-space)]"
                aria-label="Clear selection"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
