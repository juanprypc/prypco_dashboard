'use client';

import { useCallback, useState } from 'react';
import type { CatalogueDisplayItem, CatalogueUnitAllocation } from '../CatalogueGrid';

type BuyerVerificationDialogProps = {
  item: CatalogueDisplayItem;
  unitAllocation: CatalogueUnitAllocation | null;
  onSubmit: (details: { firstName: string; phoneLast4: string }) => void;
  onClose: () => void;
};

export function BuyerVerificationDialog({ item, unitAllocation, onSubmit, onClose }: BuyerVerificationDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      const trimmedFirstName = firstName.trim();
      const trimmedPhone = phoneLast4.trim();

      if (!trimmedFirstName) {
        setError('First name is required');
        return;
      }

      if (!/^\d{4}$/.test(trimmedPhone)) {
        setError('Phone last 4 digits must be exactly 4 digits');
        return;
      }

      onSubmit({ firstName: trimmedFirstName, phoneLast4: trimmedPhone });
    },
    [firstName, phoneLast4, onSubmit],
  );

  const requiredPoints = (unitAllocation?.points ?? 0) + (item.points ?? 0);

  return (
    <div className="fixed inset-0 z-[62] flex items-center justify-center bg-[var(--color-desert-dust)]/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#d1b7fb] bg-white p-6 text-[var(--color-outer-space)] shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Buyer verification</h3>
            <p className="text-sm text-[var(--color-outer-space)]/70">{item.name}</p>
          </div>
          <button onClick={onClose} className="cursor-pointer text-sm text-[var(--color-outer-space)]/50 hover:text-[var(--color-outer-space)]">
            Close
          </button>
        </div>

        {unitAllocation ? (
          <div className="mt-4 rounded-[20px] border border-[var(--color-electric-purple)]/25 bg-[var(--color-panel)]/60 p-4 text-xs text-[var(--color-outer-space)]/80">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-electric-purple)]">Selected property</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-outer-space)]">{unitAllocation.unitType || 'Allocation'}</p>
          </div>
        ) : null}

        <div className="mt-4 space-y-2 text-sm text-[var(--color-outer-space)]/80">
          <div className="flex items-center justify-between">
            <span>Required points</span>
            <strong>{requiredPoints.toLocaleString()} pts</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <p className="text-sm text-[var(--color-outer-space)]/70">Redeem this reward using {requiredPoints.toLocaleString()} points?</p>

          <div className="space-y-3 rounded-[18px] border border-[var(--color-electric-purple)]/25 bg-[var(--color-panel)]/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-electric-purple)]">Buyer verification</p>
            <label className="block text-xs font-semibold text-[var(--color-outer-space)]/80">
              Buyer first name
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="Customer first name"
                className="mt-1 w-full rounded-[14px] border border-[var(--color-outer-space)]/15 bg-white px-3 py-2 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
                autoComplete="off"
                autoFocus
              />
            </label>
            {error && error.includes('name') ? <p className="text-[11px] text-rose-500">{error}</p> : null}
            <label className="block text-xs font-semibold text-[var(--color-outer-space)]/80">
              Buyer phone · last 4 digits
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={phoneLast4}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, '');
                  setPhoneLast4(value);
                }}
                placeholder="1234"
                className="mt-1 w-full rounded-[14px] border border-[var(--color-outer-space)]/15 bg-white px-3 py-2 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/40"
                autoComplete="off"
              />
            </label>
            {error && error.includes('phone') ? <p className="text-[11px] text-rose-500">{error}</p> : null}
            <p className="text-[11px] text-[var(--color-outer-space)]/60">
              We&apos;ll store these details with the redemption so the RM team can verify the unit allocation.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="submit" className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] sm:w-auto">
              Confirm redeem
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full cursor-pointer rounded-full border border-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:bg-[var(--color-panel)]/80 sm:w-auto"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
