'use client';

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

const MAP_IMAGE = '/images/bahamas-cluster-map.jpg';

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

  const handleZoomIn = () => setZoom((prev) => Math.min(3, prev + 0.3));
  const handleZoomOut = () => setZoom((prev) => Math.max(1, prev - 0.3));
  const handleResetZoom = () => setZoom(1);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="order-2 flex-1 rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4 lg:order-1">
        <p className="text-sm font-semibold text-[var(--color-outer-space)]">Available units</p>
        <p className="text-[11px] text-[var(--color-outer-space)]/60">Select any available code to continue</p>
        <div className="mt-3 max-h-[400px] space-y-3 overflow-auto pr-2 lg:max-h-[500px]">
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
                      onClick={() => !disabled && onSelect(allocation.id)}
                      disabled={disabled}
                      className={'flex w-full items-center justify-between px-4 py-3 text-left transition min-h-[48px] ' + (
                        selected
                          ? 'bg-[var(--color-electric-purple)]/10 border-l-2 border-[var(--color-electric-purple)]'
                          : disabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-white active:bg-[var(--color-panel)]/60'
                      )}
                    >
                      <div>
                        <p className={'text-sm font-semibold ' + (disabled ? 'text-[var(--color-outer-space)]/40' : 'text-[var(--color-outer-space)]')}>
                          {allocation.points?.toLocaleString() ?? '—'} pts
                        </p>
                        <p className="text-[11px] text-[var(--color-outer-space)]/60">Code: {allocation.id}</p>
                      </div>
                      <span
                        className={'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ' + (
                          allocation.availability === 'available'
                            ? 'bg-emerald-100 text-emerald-700'
                            : allocation.availability === 'reserved'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                        )}
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
      <div className="order-1 flex-1 rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4 lg:order-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-outer-space)]">Bahamas Cluster Map</p>
            <p className="hidden text-[11px] text-[var(--color-outer-space)]/60 sm:block">Zoom and pan to explore</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-[var(--color-outer-space)]/60 sm:inline">{Math.round(zoom * 100)}%</span>
            <div className="inline-flex gap-1">
              <button type="button" onClick={handleZoomOut} disabled={zoom <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d1b7fb]/60 text-sm font-bold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
                aria-label="Zoom out">–</button>
              <button type="button" onClick={handleResetZoom} disabled={zoom === 1}
                className="flex h-8 min-w-[32px] items-center justify-center rounded-full border border-[#d1b7fb]/60 px-2 text-[10px] font-semibold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
                aria-label="Reset zoom">Reset</button>
              <button type="button" onClick={handleZoomIn} disabled={zoom >= 3}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d1b7fb]/60 text-sm font-bold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition"
                aria-label="Zoom in">+</button>
            </div>
          </div>
        </div>
        <div className="relative h-[300px] w-full overflow-auto rounded-[18px] border border-[#d1b7fb]/40 bg-[var(--color-panel)]/60 sm:h-[400px] lg:h-[500px]">
          <div className="inline-block min-h-full min-w-full origin-top-left transition-transform duration-200"
            style={{ transform: 'scale(' + zoom + ')', transformOrigin: 'top left' }}>
            <img src={MAP_IMAGE} alt="Bahamas cluster map" className="block h-full w-full object-contain" draggable={false} />
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-[var(--color-outer-space)]/50">Scroll to pan • Pinch to zoom on mobile</p>
      </div>
    </div>
  );
}
