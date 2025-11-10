'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

export function DamacMapSelector({ catalogueId, selectedAllocationId, onSelectAllocation }: DamacMapSelectorProps) {
  const [allocations, setAllocations] = useState<AllocationWithStatus[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for zoom and pan
  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);

  // Touch gesture state
  const [isPinching, setIsPinching] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const initialPinchDistance = useRef<number>(0);
  const initialZoom = useRef<number>(1);

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

  // Get unique BR types for filter
  const brTypes = useMemo(() => {
    const types = new Set(
      allocations
        .map(a => a.brType)
        .filter((br): br is string => br != null && br.trim() !== '')
    );
    const sortedTypes = Array.from(types).sort();
    return ['all', ...sortedTypes];
  }, [allocations]);

  // Filter allocations based on search and BR type
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

  // Get selected allocation details
  const selectedAllocation = useMemo(() => {
    return allocations.find(a => a.id === selectedAllocationId) || null;
  }, [allocations, selectedAllocationId]);

  const handleZoomIn = () => setZoom(prev => Math.min(6, prev + 0.5));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.5));
  const handleResetZoom = () => setZoom(1);

  // Enhanced click handler - zoom to click position
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const container = containerRef.current;
    const wrapper = imageWrapperRef.current;
    if (!container || !wrapper) return;

    // Get click position relative to image
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Calculate relative position (0-1)
    const relX = x / rect.width;
    const relY = y / rect.height;

    if (zoom < 6) {
      // Zoom in
      const newZoom = Math.min(6, zoom + 1);
      setZoom(newZoom);

      // Calculate new scroll position to keep click point centered
      setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const newScrollLeft = (relX * rect.width * newZoom) - (containerRect.width / 2);
        const newScrollTop = (relY * rect.height * newZoom) - (containerRect.height / 2);

        container.scrollLeft = Math.max(0, newScrollLeft);
        container.scrollTop = Math.max(0, newScrollTop);
      }, 50);
    } else {
      // Reset zoom
      setZoom(1);
    }
  };

  // Touch event handlers for pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Start pinch
      setIsPinching(true);
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      initialPinchDistance.current = distance;
      initialZoom.current = zoom;
    } else if (e.touches.length === 1) {
      // Check for double-tap
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;

      if (now - lastTap < DOUBLE_TAP_DELAY) {
        // Double tap detected
        e.preventDefault();
        const touch = e.touches[0];
        const rect = e.currentTarget.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const relX = x / rect.width;
        const relY = y / rect.height;

        if (zoom < 6) {
          const newZoom = Math.min(6, zoom + 1.5);
          setZoom(newZoom);

          // Center on tap point
          const container = containerRef.current;
          if (container) {
            setTimeout(() => {
              const containerRect = container.getBoundingClientRect();
              const newScrollLeft = (relX * rect.width * newZoom) - (containerRect.width / 2);
              const newScrollTop = (relY * rect.height * newZoom) - (containerRect.height / 2);

              container.scrollLeft = Math.max(0, newScrollLeft);
              container.scrollTop = Math.max(0, newScrollTop);
            }, 50);
          }
        } else {
          setZoom(1);
        }
      }
      setLastTap(now);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      const scale = distance / initialPinchDistance.current;
      const newZoom = Math.min(6, Math.max(0.5, initialZoom.current * scale));
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    setIsPinching(false);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Units List */}
      <div className="order-2 flex-1 rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4 lg:order-1">
        <p className="text-sm font-semibold text-[var(--color-outer-space)]">Available Units</p>
        <p className="text-[11px] text-[var(--color-outer-space)]/60">
          {loading ? 'Loading...' : `${availableCount} available of ${filteredAllocations.length} units`}
        </p>

        {/* Search and Filter */}
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

        {/* Units List */}
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

      {/* Map Image with Selection Overlay */}
      <div className="order-1 relative flex-1 lg:order-2">
        <div className="rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--color-outer-space)]">Bahamas Cluster Map</p>
              <p className="hidden text-[11px] text-[var(--color-outer-space)]/60 sm:block">
                {zoom < 6 ? 'Click/tap to zoom • Pinch or scroll to pan' : 'Click/tap to reset zoom'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-[var(--color-outer-space)]/60 sm:inline">{Math.round(zoom * 100)}%</span>
              <div className="inline-flex gap-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
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
                  disabled={zoom >= 6}
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
          >
            <div
              ref={imageWrapperRef}
              className="origin-top-left transition-transform duration-200"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                minWidth: '800px',
                minHeight: '560px',
                willChange: 'transform',
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <img
                src={MAP_IMAGE}
                alt="Bahamas cluster map"
                className="block h-auto w-full cursor-zoom-in select-none"
                draggable={false}
                style={{ minWidth: '800px' }}
                loading="eager"
                onClick={handleImageClick}
              />
            </div>

            {/* Floating Selection Overlay - Desktop */}
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

        {/* Bottom Sheet Selection Overlay - Mobile */}
        {selectedAllocation && (
          <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => onSelectAllocation(null)}
            />

            {/* Sheet */}
            <div className="relative rounded-t-[28px] border-t border-[var(--color-outer-space)]/10 bg-white px-6 pb-8 pt-5 shadow-2xl">
              {/* Handle */}
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
