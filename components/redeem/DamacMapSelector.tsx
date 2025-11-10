'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const DOUBLE_TAP_DELAY = 300;
const DEFAULT_BASE_WIDTH = 800;
const DEFAULT_ASPECT_RATIO = 560 / 800;

type Point = { x: number; y: number };
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function DamacMapSelector({ catalogueId, selectedAllocationId, onSelectAllocation }: DamacMapSelectorProps) {
  const [allocations, setAllocations] = useState<AllocationWithStatus[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

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

  const brTypes = useMemo(() => {
    const types = new Set(
      allocations
        .map(a => a.brType)
        .filter((br): br is string => br != null && br.trim() !== '')
    );
    const sortedTypes = Array.from(types).sort();
    return ['all', ...sortedTypes];
  }, [allocations]);

  const filteredAllocations = useMemo(() => {
    return allocations.filter(allocation => {
      const matchesSearch = searchTerm === '' ||
        allocation.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        allocation.damacIslandcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        allocation.brType?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = filterType === 'all' || allocation.brType === filterType;

      return matchesSearch && matchesType;
    });
  }, [allocations, searchTerm, filterType]);

  const availableCount = useMemo(() => {
    return filteredAllocations.filter(a => a.availability === 'available').length;
  }, [filteredAllocations]);

  const selectedAllocation = useMemo(() => {
    return allocations.find(a => a.id === selectedAllocationId) || null;
  }, [allocations, selectedAllocationId]);

  const computeBaseDims = useCallback(() => {
    const container = containerRef.current;
    const width = container ? Math.max(container.clientWidth, DEFAULT_BASE_WIDTH) : DEFAULT_BASE_WIDTH;
    const height = width * DEFAULT_ASPECT_RATIO;
    return { width, height };
  }, []);

  const setZoomAtPoint = useCallback((px: number, py: number, oldZoom: number, newZoom: number) => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = computeBaseDims();
    const contentX = (container.scrollLeft + px) / (width * oldZoom);
    const contentY = (container.scrollTop + py) / (height * oldZoom);

    const newScaledWidth = width * newZoom;
    const newScaledHeight = height * newZoom;

    const newScrollLeft = contentX * newScaledWidth - px;
    const newScrollTop = contentY * newScaledHeight - py;

    const maxScrollLeft = Math.max(0, newScaledWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, newScaledHeight - container.clientHeight);

    container.scrollLeft = clamp(newScrollLeft, 0, maxScrollLeft);
    container.scrollTop = clamp(newScrollTop, 0, maxScrollTop);
  }, [computeBaseDims]);

  const applyZoomDiscrete = useCallback((getNext: (prev: number) => number, focusClientPoint?: Point) => {
    const container = containerRef.current;
    if (!container) {
      setZoom((prev) => clamp(getNext(prev), MIN_ZOOM, MAX_ZOOM));
      return;
    }
    const rect = container.getBoundingClientRect();
    const px = focusClientPoint ? focusClientPoint.x - rect.left - container.clientLeft : container.clientWidth / 2;
    const py = focusClientPoint ? focusClientPoint.y - rect.top - container.clientTop : container.clientHeight / 2;

    setZoom((prevZoom) => {
      const nextZoom = clamp(getNext(prevZoom), MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(nextZoom - prevZoom) < 0.0001) return prevZoom;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setZoomAtPoint(px, py, prevZoom, nextZoom));
      });

      return nextZoom;
    });
  }, [setZoomAtPoint]);

  const applyZoomContinuousAt = useCallback((targetZoom: number, px: number, py: number) => {
    const container = containerRef.current;
    if (!container) return;
    const oldZoom = zoomRef.current;
    const nextZoom = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(nextZoom - oldZoom) < 0.0008) return;
    setZoom(nextZoom);
    setZoomAtPoint(px, py, oldZoom, nextZoom);
  }, [setZoomAtPoint]);

  const handleZoomIn = () => applyZoomDiscrete((prev) => prev + 0.5);
  const handleZoomOut = () => applyZoomDiscrete((prev) => prev - 0.5);
  const handleResetZoom = () => {
    setZoom(1);
    const container = containerRef.current;
    container?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let pinchActive = false;
    let startDistance = 0;
    let startZoom = 1;
    let lastTapTime = 0;
    let lastTapPX = 0;
    let lastTapPY = 0;

    const getMidpoint = (touches: TouchList) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length === 2) {
        pinchActive = true;
        ev.preventDefault();
        startDistance = Math.hypot(
          ev.touches[1].clientX - ev.touches[0].clientX,
          ev.touches[1].clientY - ev.touches[0].clientY
        );
        startZoom = zoomRef.current;
      } else if (ev.touches.length === 1 && !pinchActive) {
        const now = Date.now();
        const rect = container.getBoundingClientRect();
        const touch = ev.touches[0];
        const px = touch.clientX - rect.left - container.clientLeft;
        const py = touch.clientY - rect.top - container.clientTop;
        const withinTime = now - lastTapTime < DOUBLE_TAP_DELAY;
        const withinDistance = Math.hypot(px - lastTapPX, py - lastTapPY) < 25;

        if (withinTime && withinDistance) {
          ev.preventDefault();
          const oldZoom = zoomRef.current;
          const nextZoom = oldZoom >= MAX_ZOOM ? 1 : Math.min(MAX_ZOOM, oldZoom + 1.5);
          setZoom(nextZoom);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setZoomAtPoint(px, py, oldZoom, nextZoom));
          });
        }

        lastTapTime = now;
        lastTapPX = px;
        lastTapPY = py;
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (!pinchActive || ev.touches.length !== 2) return;
      ev.preventDefault();
      const distance = Math.hypot(
        ev.touches[1].clientX - ev.touches[0].clientX,
        ev.touches[1].clientY - ev.touches[0].clientY
      );
      if (!startDistance) return;
      const ratio = distance / startDistance;
      const targetZoom = clamp(startZoom * ratio, MIN_ZOOM, MAX_ZOOM);
      const { x, y } = getMidpoint(ev.touches);
      const rect = container.getBoundingClientRect();
      const px = x - rect.left - container.clientLeft;
      const py = y - rect.top - container.clientTop;
      applyZoomContinuousAt(targetZoom, px, py);
    };

    const onTouchEnd = () => {
      pinchActive = false;
      startDistance = 0;
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });
    container.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyZoomContinuousAt, setZoomAtPoint]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    if (e.ctrlKey) {
      e.preventDefault();
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left - container.clientLeft;
      const py = e.clientY - rect.top - container.clientTop;
      const scale = Math.exp(-e.deltaY * 0.0015);
      const targetZoom = clamp(zoomRef.current * scale, MIN_ZOOM, MAX_ZOOM);
      applyZoomContinuousAt(targetZoom, px, py);
    }
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
            {brTypes.map(type => (
              <option key={type} value={type}>
                {type === 'all' ? 'All BR Types' : type}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 max-h-[400px] space-y-2 overflow-auto pr-2 lg:max-h-[500px]">
          {error && (
            <div className="rounded-[12px] border border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700">
              {error}
            </div>
          )}
          {loading && !error && (
            <p className="py-8 text-center text-sm text-[var(--color-outer-space)]/40">
              Loading units...
            </p>
          )}
          {!loading && !error && filteredAllocations.map((allocation) => {
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
                  <p className={'text-sm font-semibold ' + (disabled ? 'text-[var(--color-outer-space)]/40' : 'text-[var(--color-outer-space)]')}>
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
                    (allocation.availability === 'available'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700')
                  }
                >
                  {allocation.availability}
                </span>
              </button>
            );
          })}
          {!loading && !error && filteredAllocations.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-outer-space)]/40">
              No units found
            </p>
          )}
        </div>
      </div>

      <div className="order-1 relative flex-1 lg:order-2">
        <div className="rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-outer-space)]">Bahamas Cluster Map</p>
              <p className="hidden text-[11px] text-[var(--color-outer-space)]/60 sm:block">
                Pinch to zoom • Drag to pan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-[var(--color-outer-space)]/60 sm:inline">{Math.round(zoom * 100)}%</span>
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 1}
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
                  disabled={zoom >= 3}
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
            className="relative h-[300px] w-full overflow-auto rounded-[18px] border border-[#d1b7fb]/40 bg-[var(--color-panel)]/60 sm:h-[400px] lg:h-[500px]"
            style={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x pan-y',
            }}
            onWheel={handleWheel}
          >
            <div
              className="origin-top-left transition-transform duration-200"
              style={{
                transform: \`scale(\${zoom})\`,
                transformOrigin: 'top left',
                minWidth: '800px',
                minHeight: '560px',
                willChange: 'transform',
              }}
            >
              <img
                src={MAP_IMAGE}
                alt="Bahamas cluster map"
                className="block h-auto w-full select-none"
                draggable={false}
                style={{
                  minWidth: '800px',
                  pointerEvents: 'none',
                }}
                loading="eager"
              />
            </div>

            {selectedAllocation && (
              <div className="pointer-events-none absolute inset-0 hidden items-center justify-center p-8 lg:flex">
                <div className="pointer-events-auto max-w-md rounded-[20px] border border-[var(--color-outer-space)]/10 bg-white p-6 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-outer-space)]/50">
                        Selected Unit
                      </p>
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
                        <p className="mt-1 text-base font-semibold text-[var(--color-outer-space)]">
                          {selectedAllocation.brType}
                        </p>
                      </div>
                    )}
                    {selectedAllocation.unitType && (
                      <div className="col-span-2">
                        <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Unit Type</p>
                        <p className="mt-1 text-sm font-medium text-[var(--color-outer-space)]">
                          {selectedAllocation.unitType}
                        </p>
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
            <p className="text-[10px] text-[var(--color-outer-space)]/50">
              Double-tap or pinch to zoom • Drag to pan
            </p>
            <a
              href={MAP_IMAGE_ORIGINAL}
              download="Bahamas-Cluster-Map.jpg"
              className="text-[10px] text-[var(--color-electric-purple)] hover:underline"
            >
              Download map
            </a>
          </div>
        </div>

        {selectedAllocation && (
          <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => onSelectAllocation(null)}
            />

            <div className="relative rounded-t-[28px] border-t border-[var(--color-outer-space)]/10 bg-white px-6 pb-8 pt-5 shadow-2xl">
              <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[var(--color-outer-space)]/20" />

              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-outer-space)]/50">
                    Selected Unit
                  </p>
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
                  <p className="mt-1.5 text-lg font-semibold text-[var(--color-outer-space)]">
                    {selectedAllocation.points?.toLocaleString() ?? '—'}
                  </p>
                </div>
                {selectedAllocation.brType && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/50">Bedrooms</p>
                    <p className="mt-1.5 text-lg font-semibold text-[var(--color-outer-space)]">
                      {selectedAllocation.brType}
                    </p>
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
                  <p className="mt-1 text-sm font-medium text-[var(--color-outer-space)]">
                    {selectedAllocation.unitType}
                  </p>
                </div>
              )}

              <button
                type="button"
                className="mt-6 w-full rounded-full bg-[var(--color-outer-space)] px-4 py-4 text-base font-semibold text-white transition active:scale-95"
              >
                Proceed to Payment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
