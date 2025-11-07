'use client';

import { useState } from 'react';
import { DamacMapSelector } from '@/components/redeem';
import type { CatalogueUnitAllocation } from '@/components/CatalogueGrid';

type AllocationWithStatus = CatalogueUnitAllocation & {
  availability: 'available' | 'reserved' | 'booked';
};

const MOCK_ALLOCATIONS: AllocationWithStatus[] = [
  { id: 'rec001_M6BR_101', unitType: '6BR Mansion', maxStock: 1, points: 8200, pictureUrl: null, priceAed: 4100000, availability: 'available' },
  { id: 'rec002_M6BR_102', unitType: '6BR Mansion', maxStock: 0, points: 8200, pictureUrl: null, priceAed: 4100000, availability: 'reserved' },
  { id: 'rec003_M6BR_103', unitType: '6BR Mansion', maxStock: 1, points: 8200, pictureUrl: null, priceAed: 4100000, availability: 'available' },
  { id: 'rec004_V5BR_201', unitType: '5BR Signature Villa', maxStock: 1, points: 6500, pictureUrl: null, priceAed: 3250000, availability: 'available' },
  { id: 'rec005_V5BR_202', unitType: '5BR Signature Villa', maxStock: 1, points: 6500, pictureUrl: null, priceAed: 3250000, availability: 'available' },
  { id: 'rec006_V5BR_203', unitType: '5BR Signature Villa', maxStock: 0, points: 6500, pictureUrl: null, priceAed: 3250000, availability: 'booked' },
  { id: 'rec007_T4BR_301', unitType: '4BR Townhouse', maxStock: 1, points: 4800, pictureUrl: null, priceAed: 2400000, availability: 'available' },
  { id: 'rec008_T4BR_302', unitType: '4BR Townhouse', maxStock: 1, points: 4800, pictureUrl: null, priceAed: 2400000, availability: 'available' },
  { id: 'rec009_T4BR_303', unitType: '4BR Townhouse', maxStock: 1, points: 4800, pictureUrl: null, priceAed: 2400000, availability: 'available' },
  { id: 'rec010_T4BR_304', unitType: '4BR Townhouse', maxStock: 0, points: 4800, pictureUrl: null, priceAed: 2400000, availability: 'reserved' },
];

export default function TestDamacMapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testScenario, setTestScenario] = useState<'normal' | 'empty' | 'all-reserved'>('normal');

  const allocations: AllocationWithStatus[] = (() => {
    switch (testScenario) {
      case 'empty': return [];
      case 'all-reserved': return MOCK_ALLOCATIONS.map((a) => ({ ...a, availability: 'reserved' as const, maxStock: 0 }));
      default: return MOCK_ALLOCATIONS;
    }
  })();

  const selectedAllocation = allocations.find((a) => a.id === selectedId);

  return (
    <div className="min-h-screen bg-[var(--color-desert-dust)]/30 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-[28px] border border-[#d1b7fb] bg-white p-6 shadow-lg">
          <h1 className="text-2xl font-bold text-[var(--color-outer-space)]">DAMAC Map Selector Test</h1>
          <p className="mt-2 text-sm text-[var(--color-outer-space)]/70">Isolated test for DamacMapSelector component</p>
        </div>

        <div className="mb-6 rounded-[28px] border border-[#d1b7fb] bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-[var(--color-outer-space)]">Test Scenarios</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => { setTestScenario('normal'); setSelectedId(null); }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${testScenario === 'normal' ? 'bg-[var(--color-electric-purple)] text-white' : 'border border-[#d1b7fb] text-[var(--color-outer-space)]'}`}>
              Normal
            </button>
            <button type="button" onClick={() => { setTestScenario('empty'); setSelectedId(null); }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${testScenario === 'empty' ? 'bg-[var(--color-electric-purple)] text-white' : 'border border-[#d1b7fb] text-[var(--color-outer-space)]'}`}>
              Empty
            </button>
            <button type="button" onClick={() => { setTestScenario('all-reserved'); setSelectedId(null); }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${testScenario === 'all-reserved' ? 'bg-[var(--color-electric-purple)] text-white' : 'border border-[#d1b7fb] text-[var(--color-outer-space)]'}`}>
              All Reserved
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-[28px] border border-[#d1b7fb] bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-[var(--color-outer-space)]">Component</h2>
          {allocations.length === 0 ? (
            <div className="rounded-[24px] border border-[#d1b7fb]/60 bg-[var(--color-panel)]/40 p-8 text-center">
              <p className="text-sm font-semibold text-[var(--color-outer-space)]">No units available</p>
            </div>
          ) : (
            <DamacMapSelector allocations={allocations} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>

        <div className="rounded-[28px] border border-[#d1b7fb] bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-lg font-semibold text-[var(--color-outer-space)]">Selection State</h2>
          {selectedAllocation ? (
            <div className="rounded-[18px] border border-emerald-500/40 bg-emerald-50/60 p-4">
              <p className="text-sm font-semibold text-emerald-900">Selected: {selectedAllocation.unitType}</p>
              <p className="text-xs text-emerald-800 mt-1">ID: {selectedAllocation.id} | Points: {selectedAllocation.points?.toLocaleString()}</p>
            </div>
          ) : (
            <div className="rounded-[18px] border border-[#d1b7fb]/60 bg-[var(--color-panel)]/40 p-4 text-center">
              <p className="text-sm text-[var(--color-outer-space)]/60">No selection</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
