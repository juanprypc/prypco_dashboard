'use client';

import { useEffect, useMemo, useState } from 'react';

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

  // Get unique BR types for filter (only 4 BR, 5 BR, 6 BR)
  const brTypes = useMemo(() => {
    const types = new Set(
      allocations
        .map(a => a.brType)
        .filter(br => br === '4 BR' || br === '5 BR' || br === '6 BR')
    );
    return ['all', ...Array.from(types).sort()];
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

  const handleZoomIn = () => setZoom(prev => Math.min(3, prev + 0.3));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.3));
  const handleResetZoom = () => setZoom(1);

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

      {/* Map Image */}
      <div className="order-1 flex-1 rounded-[24px] border border-[#d1b7fb]/60 bg-white p-4 lg:order-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--color-outer-space)]">Bahamas Cluster Map</p>
            <p className="hidden text-[11px] text-[var(--color-outer-space)]/60 sm:block">Zoom and pan to explore</p>
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
                disabled={zoom >= 3}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border border-[#d1b7fb]/60 text-base font-bold text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]/70 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 transition sm:h-8 sm:w-8 sm:text-sm"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div className="relative h-[300px] w-full overflow-auto rounded-[18px] border border-[#d1b7fb]/40 bg-[var(--color-panel)]/60 sm:h-[400px] lg:h-[500px]">
          <div
            className="origin-top-left transition-transform duration-200"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              minWidth: '800px',
              minHeight: '560px',
              willChange: 'transform',
            }}
          >
            <img
              src={MAP_IMAGE}
              alt="Bahamas cluster map"
              className="block h-auto w-full"
              draggable={false}
              style={{ minWidth: '800px' }}
              loading="eager"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-between">
          <p className="text-[10px] text-[var(--color-outer-space)]/50">
            Scroll to pan • Pinch to zoom on mobile
          </p>
          <a
            href={MAP_IMAGE_ORIGINAL}
            download="Bahamas-Cluster-Map.jpg"
            className="text-[10px] text-[var(--color-electric-purple)] hover:underline"
          >
            Download high-quality map
          </a>
        </div>
      </div>
    </div>
  );
}
