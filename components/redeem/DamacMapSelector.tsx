'use client';

import type React from 'react';
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
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const DOUBLE_TAP_DELAY = 300;
const DEFAULT_BASE_WIDTH = 800;
const DEFAULT_ASPECT_RATIO = 560 / 800;
const DEFAULT_CONTAINER_HEIGHT = 500;

type Point = { x: number; y: number };
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const detectTouchEnvironment = () => {
  if (typeof window === 'undefined') return false;
  const hasTouchStart = 'ontouchstart' in window;
  const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const isCoarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  return hasTouchStart || hasTouchPoints || isCoarsePointer;
};

type GlobalWithListeners = typeof globalThis & {
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

export function DamacMapSelector({ catalogueId, selectedAllocationId, onSelectAllocation }: DamacMapSelectorProps) {
  const [allocations, setAllocations] = useState<AllocationWithStatus[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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

  const [containerSize, setContainerSize] = useState({
    width: DEFAULT_BASE_WIDTH,
    height: DEFAULT_CONTAINER_HEIGHT,
  });
  const containerSizeRef = useRef(containerSize);
  useEffect(() => {
    containerSizeRef.current = containerSize;
  }, [containerSize]);

  const [imageAspectRatio, setImageAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const aspectRatioRef = useRef(imageAspectRatio);
  useEffect(() => {
    aspectRatioRef.current = imageAspectRatio;
  }, [imageAspectRatio]);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const pointerDragRef = useRef({
    active: false,
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

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

  const updateAspectRatioFromImage = (event?: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event?.currentTarget ?? imageRef.current;
    if (!img) return;
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth && naturalHeight) {
      setImageAspectRatio(naturalHeight / naturalWidth);
    }
  };

  useEffect(() => {
    const img = imageRef.current;
    if (img && (img.complete || img.naturalWidth)) {
      updateAspectRatioFromImage();
    }
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const el = containerRef.current;
      if (!el) return;
      setContainerSize({
        width: el.clientWidth || DEFAULT_BASE_WIDTH,
        height: el.clientHeight || DEFAULT_CONTAINER_HEIGHT,
      });
    };

    const element = containerRef.current;
    if (!element) return;

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateSize());
      observer.observe(element);
      return () => observer.disconnect();
    }

    const globalWithListeners = globalThis as GlobalWithListeners;
    if (typeof globalWithListeners.addEventListener === 'function') {
      globalWithListeners.addEventListener('resize', updateSize);
      return () => globalWithListeners.removeEventListener?.('resize', updateSize);
    }
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

  const effectiveContainerWidth = containerSize.width || DEFAULT_BASE_WIDTH;
  const effectiveContainerHeight = containerSize.height || DEFAULT_CONTAINER_HEIGHT;
  const baseWidth = Math.max(effectiveContainerWidth, DEFAULT_BASE_WIDTH);
  const baseHeight = baseWidth * imageAspectRatio;
  const scaledWidth = baseWidth * zoom;
  const scaledHeight = baseHeight * zoom;

  const canPanHorizontally = scaledWidth > effectiveContainerWidth + 1;
  const canPanVertically = scaledHeight > effectiveContainerHeight + 1;
  const canPan = canPanHorizontally || canPanVertically;
  const showGrabCursor = canPan && zoom > 1;
  const containerCursor = showGrabCursor
    ? (isDragging ? 'grabbing' : 'grab')
    : isTouchDevice
      ? (zoom >= MAX_ZOOM ? 'zoom-out' : 'zoom-in')
      : 'auto';
  const interactionHint = isTouchDevice
    ? 'Double-tap or pinch to zoom • Drag to pan'
    : 'Use +/– buttons to zoom • Scroll to pan';

  const computeBaseDims = useCallback(() => {
    const width = Math.max(containerSizeRef.current.width || DEFAULT_BASE_WIDTH, DEFAULT_BASE_WIDTH);
    const height = width * aspectRatioRef.current;
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
    const shouldRecenter = isTouchDevice && container;
    const rect = shouldRecenter ? container.getBoundingClientRect() : null;
    const px = shouldRecenter && rect
      ? (focusClientPoint ? focusClientPoint.x - rect.left - container!.clientLeft : container!.clientWidth / 2)
      : 0;
    const py = shouldRecenter && rect
      ? (focusClientPoint ? focusClientPoint.y - rect.top - container!.clientTop : container!.clientHeight / 2)
      : 0;

    setZoom((prevZoom) => {
      const nextZoom = clamp(getNext(prevZoom), MIN_ZOOM, MAX_ZOOM);
      if (Math.abs(nextZoom - prevZoom) < 0.0001) return prevZoom;

      if (shouldRecenter) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setZoomAtPoint(px, py, prevZoom, nextZoom));
        });
      } else {
        const c = containerRef.current;
        if (c) {
          const { width, height } = computeBaseDims();
          const maxScrollLeft = Math.max(0, width * nextZoom - c.clientWidth);
          const maxScrollTop = Math.max(0, height * nextZoom - c.clientHeight);
          c.scrollLeft = clamp(c.scrollLeft, 0, maxScrollLeft);
          c.scrollTop = clamp(c.scrollTop, 0, maxScrollTop);
        }
      }

      return nextZoom;
    });
  }, [computeBaseDims, isTouchDevice, setZoomAtPoint]);

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

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isTouchDevice) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    applyZoomDiscrete((prev) => (prev >= MAX_ZOOM ? 1 : prev + 1), { x: e.clientX, y: e.clientY });
  };

  const handleContainerDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isTouchDevice) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    applyZoomDiscrete((prev) => (prev >= MAX_ZOOM ? 1 : Math.min(MAX_ZOOM, prev + 1.5)), { x: e.clientX, y: e.clientY });
  };

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!isTouchDevice) return;
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
  }, [applyZoomContinuousAt, isTouchDevice]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.pointerType !== 'mouse' && e.pointerType !== 'pen') || e.button !== 0 || !canPan) return;
    const container = containerRef.current;
    if (!container) return;
    container.setPointerCapture?.(e.pointerId);
    suppressClickRef.current = false;
    pointerDragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
    dragMovedRef.current = false;
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDragRef.current.active || pointerDragRef.current.pointerId !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    e.preventDefault();
    const dx = e.clientX - pointerDragRef.current.startX;
    const dy = e.clientY - pointerDragRef.current.startY;
    if (!dragMovedRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      dragMovedRef.current = true;
    }
    container.scrollLeft = pointerDragRef.current.scrollLeft - dx;
    container.scrollTop = pointerDragRef.current.scrollTop - dy;
  };

  const endPointerDrag = (pointerId: number) => {
    const container = containerRef.current;
    container?.releasePointerCapture?.(pointerId);
    pointerDragRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0,
    };
    setIsDragging(false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDragRef.current.active || pointerDragRef.current.pointerId !== e.pointerId) return;
    endPointerDrag(e.pointerId);
    if (dragMovedRef.current) suppressClickRef.current = true;
    dragMovedRef.current = false;
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDragRef.current.active || pointerDragRef.current.pointerId !== e.pointerId) return;
    endPointerDrag(e.pointerId);
    dragMovedRef.current = false;
    suppressClickRef.current = false;
  };

  useEffect(() => {
    if (!isTouchDevice) return;
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
  }, [applyZoomContinuousAt, setZoomAtPoint, isTouchDevice]);

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
            className="relative h-[300px] w-full overflow-auto rounded-[18px] border border-[#d1b7fb]/40 bg-[var(--color-panel)]/60 sm:h-[400px] lg:h-[500px]"
            style={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x pan-y',
              overscrollBehavior: 'contain',
              cursor: containerCursor,
            }}
            onClick={handleContainerClick}
            onDoubleClick={handleContainerDoubleClick}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <div
              ref={imageWrapperRef}
              className="relative select-none"
              style={{
                width: scaledWidth,
                height: scaledHeight,
              }}
            >
              <img
                ref={imageRef}
                src={MAP_IMAGE}
                alt="Bahamas cluster map"
                className="block h-full w-full select-none"
                draggable={false}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
                loading="eager"
                onLoad={updateAspectRatioFromImage}
              />
            </div>

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
