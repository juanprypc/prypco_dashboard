'use client';

import { useEffect, useRef } from 'react';
import { formatAedCompact, formatNumber } from '@/lib/format';
import { getCatalogueStatusConfig } from '@/lib/catalogueStatus';
import { emitAnalyticsEvent } from '@/lib/clientAnalytics';
import type { CatalogueDisplayItem, CatalogueUnitAllocation } from '../CatalogueGrid';

type UnitAllocationDialogProps = {
  item: CatalogueDisplayItem;
  selectedId: string | null;
  onSelect: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function UnitAllocationDialog({ item, selectedId, onSelect, onConfirm, onClose }: UnitAllocationDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const allocations = item.unitAllocations;
  const isOutOfStock = (allocation: CatalogueUnitAllocation): boolean =>
    typeof allocation.maxStock === 'number' ? allocation.maxStock <= 0 : false;
  const hasSelectable = allocations.some((allocation) => !isOutOfStock(allocation));
  const selectedAllocation = allocations.find((allocation) => allocation.id === selectedId) ?? null;
  const confirmDisabled =
    !selectedAllocation ||
    isOutOfStock(selectedAllocation) ||
    (!!item.status && getCatalogueStatusConfig(item.status)?.redeemDisabled);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onClose]);

  useEffect(() => {
    if (confirmDisabled) {
      closeRef.current?.focus();
    } else {
      confirmRef.current?.focus();
    }
  }, [confirmDisabled]);

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`unit-allocation-${item.id}`}
        className="w-full max-w-lg rounded-[28px] border border-[#d1b7fb] bg-white p-6 text-[var(--color-outer-space)] shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`unit-allocation-${item.id}`} className="text-lg font-semibold">
                Choose property type
              </h3>
            </div>
            <p className="mt-1 text-xs text-[var(--color-outer-space)]/70">
              Select the exact property option you want to redeem.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full border border-transparent bg-[var(--color-panel)] px-3 py-1 text-xs font-medium text-[var(--color-outer-space)]/60 transition hover:border-[var(--color-outer-space)]/20 hover:bg-white hover:text-[var(--color-outer-space)]"
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {allocations.map((allocation) => {
            const disabled = isOutOfStock(allocation);
            const selected = selectedId === allocation.id;
            const pointsLabel = typeof allocation.points === 'number' ? formatNumber(allocation.points) : null;
            const priceLabel = formatAedCompact(allocation.priceAed);
            return (
              <button
                key={allocation.id}
                type="button"
                onClick={() => {
                  if (disabled) return;
                  emitAnalyticsEvent('reward_allocation_selected', {
                    reward_id: item.id,
                    allocation_id: allocation.id,
                  });
                  onSelect(allocation.id);
                }}
                className={`w-full rounded-[22px] border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)] focus:ring-offset-2 focus:ring-offset-white sm:px-5 sm:py-4 ${
                  selected
                    ? 'border-[var(--color-electric-purple)] bg-[var(--color-panel)]/70'
                    : 'border-[#d1b7fb]/70 bg-white hover:border-[var(--color-electric-purple)]/40'
                } disabled:cursor-not-allowed disabled:opacity-50`}
                aria-pressed={selected}
                disabled={disabled}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-outer-space)]">{allocation.unitType || 'Property option'}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-outer-space)]/60">
                      {pointsLabel ? `${pointsLabel} points` : 'Uses catalogue points'}
                    </p>
                    {priceLabel ? (
                      <p className="mt-0.5 text-[11px] text-[var(--color-outer-space)]/60">Avg {priceLabel}</p>
                    ) : null}
                    {disabled ? (
                      <p className="mt-0.5 text-[11px] text-rose-500/70">Currently unavailable</p>
                    ) : null}
                  </div>
                  <div className="text-right text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-electric-purple)]">
                    {selected ? 'Selected' : disabled ? 'Unavailable' : 'Choose'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {allocations.length === 0 ? (
          <p className="mt-4 text-xs text-[var(--color-outer-space)]/60">No unit allocations are configured for this reward yet.</p>
        ) : !hasSelectable ? (
          <p className="mt-4 text-xs text-rose-500">All variants are currently unavailable. Please reach out to the fulfilment team for availability.</p>
        ) : !selectedAllocation ? (
          <p className="mt-4 text-xs text-[var(--color-outer-space)]/60">Choose a property to continue with the redemption.</p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-transparent px-4 py-2 text-xs font-semibold text-[var(--color-outer-space)]/60 transition hover:bg-[var(--color-panel)]/80"
          >
            Back
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded-full border border-[var(--color-outer-space)] px-4 py-2 text-xs font-semibold text-[var(--color-outer-space)] transition hover:bg-[var(--color-panel)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
