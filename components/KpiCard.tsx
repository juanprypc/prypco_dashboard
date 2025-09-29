'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from '@/lib/format';

type Props = {
  title: string;
  value: string | number;
  unit?: string;
  note?: string;
  animate?: boolean;
  durationMs?: number;
  headerAccessory?: React.ReactNode;
  expanded?: boolean;
  children?: React.ReactNode;
};

function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => setPrefers(event.matches);
    setPrefers(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }
    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  return prefers;
}

function useAnimatedNumber(target: number | null, options: { durationMs?: number; enabled?: boolean }) {
  const { durationMs = 800, enabled = true } = options;
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate = enabled && !prefersReducedMotion && target !== null;
  const [value, setValue] = useState<number>(target ?? 0);
  const previous = useRef<number>(target ?? 0);

  useEffect(() => {
    if (target === null) return;

    const startValue = previous.current ?? 0;
    const endValue = target;

    if (!shouldAnimate || startValue === endValue) {
      previous.current = endValue;
      setValue(endValue);
      return;
    }

    let frame = 0;
    const startTime = performance.now();
    const duration = Math.max(200, durationMs);

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOut(progress);
      const nextValue = startValue + (endValue - startValue) * eased;
      setValue(nextValue);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    previous.current = endValue;

    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [durationMs, shouldAnimate, target]);

  return target === null ? null : value;
}

export function KpiCard({
  title,
  value,
  unit,
  note,
  animate = false,
  durationMs,
  headerAccessory,
  expanded = true,
  children,
}: Props) {
  const numericTarget = useMemo(() => (typeof value === 'number' ? value : null), [value]);
  const animatedValue = useAnimatedNumber(numericTarget, { durationMs, enabled: animate });
  const formatted = useMemo(() => {
    if (numericTarget === null || animatedValue === null) {
      return value;
    }
    return formatNumber(Math.round(animatedValue));
  }, [animatedValue, numericTarget, value]);

  return (
    <div className="flex h-full w-full flex-col items-start justify-between rounded-[22px] bg-white/60 shadow-[0_12px_30px_-28px_rgba(13,9,59,0.25)] backdrop-blur-sm p-3 text-left text-[var(--color-outer-space)] sm:rounded-[28px] sm:p-6">
      <div className="flex w-full items-start justify-between gap-3">
        <p className="text-xs font-normal text-[var(--color-outer-space)]/75 sm:text-xl">{title}</p>
        {headerAccessory ? <div className="flex shrink-0 items-center">{headerAccessory}</div> : null}
      </div>
      <div className="mt-2 w-full text-left text-[20px] font-bold leading-[1.08] tracking-tight sm:mt-6 sm:text-[48px]">
        {formatted}
        {unit ? (
          <span className="mt-1 block text-[12px] font-bold text-[var(--color-outer-space)] sm:mt-2 sm:text-[24px]">
            {unit}
          </span>
        ) : null}
      </div>
      {children ? (
        <div
          className={`w-full overflow-hidden transition-all duration-300 ease-out ${
            expanded
              ? 'mt-3 sm:mt-6 max-h-[620px] opacity-100'
              : 'mt-0 max-h-0 opacity-0 pointer-events-none'
          }`}
        >
          {children}
        </div>
      ) : null}
      {note ? (
        <p className="mt-2 text-[10px] text-[var(--color-outer-space)]/60 sm:mt-4 sm:text-sm">{note}</p>
      ) : null}
    </div>
  );
}
