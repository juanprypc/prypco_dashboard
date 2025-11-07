'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { CatalogueUnitAllocation } from '../CatalogueGrid';

type AllocationWithStatus = CatalogueUnitAllocation & {
  availability: 'available' | 'reserved' | 'booked';
};

type DamacMapSelectorProps = {
  allocations: AllocationWithStatus[];
  selectedId: string | null;
  onSelect: (allocationId: string) => void;
};

const MAP_IMAGE = '/image_assets/Bahamas 1 Cluster Key Plan.jpg';

export function DamacMapSelector({ allocations, selectedId, onSelect }: DamacMapSelectorProps) {
  const groupedAllocations = useMemo(() => {
    const grouped = new Map<string, AllocationWithStatus[]>();
    allocations.forEach((allocation) => {
      const key = allocation.unitType ?? 'Unit';
      const list = grouped.get(key) ?? [];
      list.push(allocation);
      grouped.set(key, list);
    });
    return Array.from(grouped.entries());
  }, [allocations]);

  const [zoom, setZoom] = useState(1);

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex-1 overflow-hidden rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-outer-space)]">Bahamas Cluster Map</p>
            <p className="text-[11px] text-[var(--color-outer-space)]/60">Use the controls below to zoom and pan the project layout.</p>
          </div>
          <div className="inline-flex gap-2">
            <button
              type="button"
              className="rounded-full border border-[#d1b7fb]/60 px-3 py-1 text-xs font-semibold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70"
              onClick={() => setZoom((value) => Math.max(1, value - 0.2))}
            >
              –
            </button>
            <button
              type="button"
              className="rounded-full border border-[#d1b7fb]/60 px-3 py-1 text-xs font-semibold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70"
              onClick={() => setZoom((value) => Math.min(2.5, value + 0.2))}
            >
              +
            </button>
          </div>
        </div>
        <div className="relative h-[320px] w-full overflow-hidden rounded-[18px] border border-[#d1b7fb]/40 bg-[var(--color-panel)]/60">
          <div className="h-full w-full overflow-auto">
            <div
              className="origin-top-left"
              style={{
                width: `${zoom * 100}%`,
                height: `${zoom * 100}%`,
              }}
            >
              <div className="relative min-h-[320px] min-w-[480px]">
                <Image
                  src={MAP_IMAGE}
                  alt="Bahamas cluster map"
                  fill
                  sizes="(max-width: 768px) 100vw, 480px"
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4">
        <p className="text-sm font-semibold text-[var(--color-outer-space)]">Available units</p>
        <p className="text-[11px] text-[var(--color-outer-space)]/60">Select any available code to continue with your reservation.</p>
        <div className="mt-3 max-h-[360px] space-y-3 overflow-auto pr-2">
          {groupedAllocations.map(([unitType, unitAllocations]) => (
            <div key={unitType} className="rounded-[18px] border border-[#d1b7fb]/60 bg-[var(--color-panel)]/40">
              <div className="border-b border-[#d1b7fb]/40 px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-outer-space)]/70">{unitType}</p>
              </div>
              <div className="divide-y divide-[#d1b7fb]/30">
                {unitAllocations.map((allocation) => {
                  const disabled = allocation.availability !== 'available';
                  const selected = allocation.id === selectedId;
                  return (
                    <button
                      key={allocation.id}
                      type="button"
                      onClick={() => onSelect(allocation.id)}
                      disabled={disabled}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left transition ${
                        selected
                          ? 'bg-white'
                          : disabled
                            ? 'cursor-not-allowed text-[var(--color-outer-space)]/40 bg-transparent'
                            : 'hover:bg-white'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-outer-space)]">
                          {allocation.points?.toLocaleString() ?? '—'} pts
                        </p>
                        <p className="text-[11px] text-[var(--color-outer-space)]/60">Code: {allocation.id}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          allocation.availability === 'available'
                            ? 'bg-emerald-50 text-emerald-600'
                            : allocation.availability === 'reserved'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {allocation.availability}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
