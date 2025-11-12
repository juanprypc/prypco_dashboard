'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Panzoom, { type PanzoomEventDetail, type PanzoomObject } from '@panzoom/panzoom';

type AllocationWithStatus = {
  id: string;
  points?: number;
  unitType?: string;
  availability: 'available' | 'booked';
  damacIslandcode?: string;
  brType?: string;
};

type DamacMapSelectorProps = {
  catalogueId: string;
  selectedAllocationId: string | null;
  onSelectAllocation: (id: string | null) => void;
};

const MAP_IMAGE = '/images/bahamas-version1.jpg';
const MAP_IMAGE_ORIGINAL = '/images/bahamas-cluster-map.jpg';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const DEFAULT_BASE_WIDTH = 800;
const detectTouchEnvironment = () => {
  if (typeof window === 'undefined') return false;
  const hasTouchStart = 'ontouchstart' in window;
  const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const isCoarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  return hasTouchStart || hasTouchPoints || isCoarsePointer;
};

export function DamacMapSelector({ catalogueId, selectedAllocationId, onSelectAllocation }: DamacMapSelectorProps) {
  const [allocations, setAllocations] = useState<AllocationWithStatus[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    const update = () => setIsTouchDevice(detectTouchEnvironment());
    update();
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(pointer: coarse)');
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    if (typeof media.addListener === 'function') {
      media.addListener(update);
      return () => media.removeListener(update);
    }
    return;
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = catalogueId ? `?catalogueId=${catalogueId}` : '';
    fetch(`/api/damac/map${q}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAllocations(data.allocations || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch allocations:', err);
        setError('Failed to load units. Please try again.');
        setLoading(false);
      });
  }, [catalogueId]);

  useEffect(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return;

    const panzoom = Panzoom(image, {
      maxScale: MAX_ZOOM,
      minScale: MIN_ZOOM,
      startScale: 1,
      step: 0.5,
      canvas: true,
      cursor: 'grab',
      contain: 'inside',
      touchAction: 'none',
    });
    panzoomRef.current = panzoom;

    const handleChange = (event: Event) => {
      const { detail } = event as CustomEvent<PanzoomEventDetail>;
      if (detail?.scale) {
        setZoom(Number(detail.scale.toFixed(2)));
      }
    };

    image.addEventListener('panzoomchange', handleChange as EventListener);

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      panzoom.zoomWithWheel(event);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      image.removeEventListener('panzoomchange', handleChange as EventListener);
      container.removeEventListener('wheel', handleWheel);
      panzoom.destroy();
      panzoomRef.current = null;
    };
  }, []);

  const brTypes = useMemo(() => {
    const types = new Set(
      allocations
        .map((a) => a.brType)
        .filter((br): br is string => br != null && br.trim() !== '')
    );
    return ['all', ...Array.from(types).sort()];
  }, [allocations]);

  const filteredAllocations = useMemo(() => {
    return allocations.filter((allocation) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        q === '' ||
        allocation.id.toLowerCase().includes(q) ||
        allocation.damacIslandcode?.toLowerCase().includes(q) ||
        allocation.brType?.toLowerCase().includes(q);
      const matchesType = filterType === 'all' || allocation.brType === filterType;
      return matchesSearch && matchesType;
    });
  }, [allocations, searchTerm, filterType]);

  const availableCount = useMemo(
    () => filteredAllocations.filter((a) => a.availability === 'available').length,
    [filteredAllocations]
  );

  const selectedAllocation = useMemo(
    () => allocations.find((a) => a.id === selectedAllocationId) || null,
    [allocations, selectedAllocationId]
  );

  const interactionHint = isTouchDevice
    ? 'Double-tap or pinch to zoom • Drag to pan'
    : 'Use +/– buttons to zoom • Scroll to pan';

  const handleZoomIn = () => panzoomRef.current?.zoomIn({ animate: false });
  const handleZoomOut = () => panzoomRef.current?.zoomOut({ animate: false });
  const handleResetZoom = () => {
    panzoomRef.current?.reset({ animate: true });
    setZoom(1);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="order-2 flex-1 rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4 lg:order-1">
        <p className="text-sm font-semibold text-[var(--color-outer-space)]">Available Units</p>
        <p className="text-[11px] text-[var(--color-outer-space)]/60">
          {loading ? 'Loading...' : `${availableCount} available of ${filteredAllocations.length} units`}
        </p>

        <div className="mt-3 space-y-2">
          <input
            type="text"
            placeholder="Search by code, island, or BR type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={loading}
            className="w-full rounded-[12px] border border-[#d1b7fb]/60 bg-white px-3 py-2 text-sm text-[var(--color-outer-space)] placeholder:text-[var(--color-outer-space)]/40 focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/20 disabled:opacity-50"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            disabled={loading}
            className="w-full rounded-[12px] border border-[#d1b7fb]/60 bg-white px-3 py-2 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/20 disabled:opacity-50"
          >
            {brTypes.map((type) => (
              <option key={type} value={type}>
                {type === 'all' ? 'All BR Types' : type}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 max-h-[400px] space-y-2 overflow-auto pr-2 lg:max-h-[500px]">
          {error && (
            <div className="rounded-[12px] border border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700">{error}</div>
          )}
          {loading && !error && <p className="py-8 text-center text-sm text-[var(--color-outer-space)]/40">Loading units...</p>}
          {!loading &&
            !error &&
            filteredAllocations.map((allocation) => {
              const disabled = allocation.availability !== 'available';
              const selected = allocation.id === selectedAllocationId;
              return (
                <button
                  key={allocation.id}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    onSelectAllocation(selectedAllocationId === allocation.id ? null : allocation.id);
                  }}
                  disabled={disabled}
                  className={
                    'flex w-full items-center justify-between rounded-[12px] border px-3 py-2.5 text-left transition ' +
                    (selected
                      ? 'border-[var(--color-electric-purple)] bg-[var(--color-electric-purple)]/10'
                      : disabled
                        ? 'border-[#d1b7fb]/30 cursor-not-allowed opacity-50'
                        : 'border-[#d1b7fb]/60 hover:bg-[var(--color-panel)]/60 active:bg-[var(--color-panel)]')
                  }
                >
                  <div className="flex-1">
                    <p
                      className={
                        'text-sm font-semibold ' +
                        (disabled ? 'text-[var(--color-outer-space)]/40' : 'text-[var(--color-outer-space)]')
                      }
                    >
                      {allocation.damacIslandcode || allocation.id}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-outer-space)]/60">
                      <span>{allocation.points?.toLocaleString() ?? '—'} pts</span>
                      {allocation.unitType && (
                        <>
                          <span>•</span>
                          <span>{allocation.unitType}</span>
                        </>
                      )}
                      {allocation.brType && (
                        <>
                          <span>•</span>
                          <span>{allocation.brType}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className={
                      'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ' +
                      (allocation.availability === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')
                    }
                  >
                    {allocation.availability}
                  </span>
                </button>
              );
            })}
          {!loading && !error && filteredAllocations.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-outer-space)]/40">No units found</p>
          )}
        </div>
      </div>

      <div className="order-1 relative flex-1 lg:order-2">
        <div className="rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-outer-space)]">Bahamas Cluster Map</p>
              <p className="hidden text-[11px] text-[var(--color-outer-space)]/60 sm:block">{interactionHint}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-[var(--color-outer-space)]/60 sm:inline">{Math.round(zoom * 100)}%</span>
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= MIN_ZOOM}
                  className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border border-[#d1b7fb]/60 text-base font-bold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition sm:h-8 sm:w-8 sm:text-sm"
                  aria-label="Zoom out"
                >
                  –
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  disabled={zoom === 1}
                  className="flex h-10 min-w-[40px] touch-manipulation items-center justify-center rounded-full border border-[#d1b7fb]/60 px-2 text-xs font-semibold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition sm:h-8 sm:min-w-[32px] sm:text-[10px]"
                  aria-label="Reset zoom"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= MAX_ZOOM}
                  className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border border-[#d1b7fb]/60 text-base font-bold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition sm:h-8 sm:w-8 sm:text-sm"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div
            ref={containerRef}
            className="relative h-[300px] w-full overflow-hidden rounded-[18px] border border-[#d1b7fb]/40 bg-[var(--color-panel)]/60 sm:h-[400px] lg:h-[500px]"
            style={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'none',
              overscrollBehavior: 'contain',
            }}
          >
            <img
              ref={imageRef}
              src={MAP_IMAGE}
              alt="Bahamas cluster map"
              className="block h-full w-full select-none object-contain"
              draggable={false}
              style={{
                pointerEvents: 'none',
                userSelect: 'none',
                minWidth: `${DEFAULT_BASE_WIDTH}px`,
              }}
              loading="eager"
            />

            {selectedAllocation && (
              <div className="pointer-events-none absolute inset-0 hidden items-center justify-center p-8 lg:flex">
                <div className="pointer-events-auto max-w-md rounded-[20px] border border-[var(--color-outer-space)]/10 bg-white p-6 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-outer-space)]/50">Selected Unit</p>
                      <h3 className="mt-1 text-xl font-bold text-[var(--color-outer-space)]">
                        {selectedAllocation.damacIslandcode || selectedAllocation.id}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectAllocation(null)}
                      className="rounded-full p-1.5 text-[var(--color-outer-space)]/40 transition hover:bg-[var(--color-panel)] hover:text-[var(--color-outer-space)]"
                      aria-label="Close"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Points</p>
                      <p className="mt-1 text-base font-semibold text-[var(--color-outer-space)]">
                        {selectedAllocation.points?.toLocaleString() ?? '—'}
                      </p>
                    </div>
                    {selectedAllocation.brType && (
                      <div>
                        <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Bedrooms</p>
                        <p className="mt-1 text-base font-semibold text-[var(--color-outer-space)]">{selectedAllocation.brType}</p>
                      </div>
                    )}
                    {selectedAllocation.unitType && (
                      <div className="col-span-2">
                        <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Unit Type</p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-outer-space)]">{selectedAllocation.unitType}</p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="mt-5 w-full rounded-full bg-[var(--color-outer-space)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#150f4c]"
                  >
                    Proceed to Payment
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-between">
            <p className="text-[10px] text-[var(--color-outer-space)]/50">{interactionHint}</p>
            <a href={MAP_IMAGE_ORIGINAL} download="Bahamas-Cluster-Map.jpg" className="text-[10px] text-[var(--color-electric-purple)] hover:underline">
              Download map
            </a>
          </div>
        </div>

        {selectedAllocation && (
          <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => onSelectAllocation(null)} />
            <div className="relative rounded-t-[28px] border-t border-[var(--color-outer-space)]/10 bg-white px-6 pb-8 pt-5 shadow-2xl">
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[var(--color-outer-space)]/20" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-outer-space)]/50">Selected Unit</p>
                  <h3 className="mt-1 text-2xl font-bold text-[var(--color-outer-space)]">
                    {selectedAllocation.damacIslandcode || selectedAllocation.id}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectAllocation(null)}
                  className="rounded-full p-2 text-[var(--color-outer-space)]/40 transition active:bg-[var(--color-panel)]"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Points</p>
                  <p className="mt-1.5 text-lg font-semibold text-[var(--color-outer-space)]">{selectedAllocation.points?.toLocaleString() ?? '—'}</p>
                </div>
                {selectedAllocation.brType && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Bedrooms</p>
                    <p className="mt-1.5 text-lg font-semibold text-[var(--color-outer-space)]">{selectedAllocation.brType}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Status</p>
                  <span className="mt-1.5 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Available
                  </span>
                </div>
              </div>

              {selectedAllocation.unitType && (
                <div className="mt-4">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Unit Type</p>
                  <p className="mt-1 text-sm font-medium text-[var(--color-outer-space)]">{selectedAllocation.unitType}</p>
                </div>
              )}

              <button type="button" className="mt-6 w-full rounded-full bg-[var(--color-outer-space)] px-4 py-4 text-base font-semibold text-white transition active:scale-95">
                Proceed to Payment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
