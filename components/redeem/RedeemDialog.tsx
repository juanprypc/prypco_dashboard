'use client';

import { useEffect, useState } from 'react';
import { formatAedCompact, formatNumber } from '@/lib/format';
import { getCatalogueStatusConfig } from '@/lib/catalogueStatus';
import type { CatalogueDisplayItem, CatalogueUnitAllocation } from '../CatalogueGrid';

type RedeemDialogProps = {
  item: CatalogueDisplayItem;
  unitAllocation?: CatalogueUnitAllocation | null;
  availablePoints: number;
  status: 'idle' | 'submitting' | 'success' | 'error';
  message: string | null;
  minAmount: number;
  pointsPerAed: number;
  agentId?: string | null;
  agentCode?: string | null;
  baseQuery?: string;
  onSubmit: (details: { customerFirstName: string; customerPhoneLast4: string }) => void;
  onClose: () => void;
  onShowTerms?: (item: CatalogueDisplayItem) => void;
  termsAccepted?: boolean;
  preFilledDetails?: { firstName: string; phoneLast4: string } | null;
};

export function RedeemDialog({
  item,
  unitAllocation,
  availablePoints,
  status,
  message,
  onSubmit,
  onClose,
  minAmount,
  pointsPerAed,
  agentId,
  agentCode,
  baseQuery,
  onShowTerms,
  termsAccepted = true,
  preFilledDetails,
}: RedeemDialogProps) {
  const [customerFirstName, setCustomerFirstName] = useState(preFilledDetails?.firstName || '');
  const [customerPhoneLast4, setCustomerPhoneLast4] = useState(preFilledDetails?.phoneLast4 || '');
  const rawRequiredPoints =
    typeof unitAllocation?.points === 'number'
      ? unitAllocation.points
      : typeof item.points === 'number'
        ? item.points
        : 0;
  const requiredPoints = Number.isFinite(rawRequiredPoints) ? Math.max(rawRequiredPoints, 0) : 0;
  const insufficient = requiredPoints > availablePoints;
  const busy = status === 'submitting';
  const showSuccess = status === 'success';
  const showError = status === 'error';
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);
  const termsSatisfied = !item.termsActive || termsAccepted;
  const trimmedFirstName = customerFirstName.trim();
  const trimmedPhone = customerPhoneLast4.trim();
  const requiresBuyerVerification = item.requiresBuyerVerification === true;
  const firstNameValid = !requiresBuyerVerification || (preFilledDetails ? true : trimmedFirstName.length > 0);
  const phoneValid = !requiresBuyerVerification || (preFilledDetails ? true : /^\d{4}$/.test(trimmedPhone));
  const statusConfig = item.status ? getCatalogueStatusConfig(item.status) : null;
  const confirmDisabled =
    busy ||
    !termsSatisfied ||
    !firstNameValid ||
    !phoneValid ||
    (!!item.status && statusConfig?.redeemDisabled);
  const selectedPriceLabel = formatAedCompact(unitAllocation?.priceAed ?? null);

  const extraPointsNeeded = insufficient ? requiredPoints - availablePoints : 0;

  const normaliseAmount = (value: number, min: number) => {
    if (!Number.isFinite(value) || value <= 0) return min;
    const multiples = Math.max(1, Math.ceil(value / min));
    return multiples * min;
  };

  const suggestedAed = extraPointsNeeded ? normaliseAmount(Math.ceil(extraPointsNeeded / pointsPerAed), minAmount) : minAmount;
  const suggestedPoints = suggestedAed * pointsPerAed;

  async function handleDirectTopup() {
    if (!agentId && !agentCode) {
      setTopupError('Missing agent details.');
      return;
    }
    setTopupError(null);
    setTopupBusy(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId,
          agentCode,
          amountAED: suggestedAed,
          baseQuery,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to start checkout');
      if (json?.url) {
        window.location.href = json.url as string;
      } else {
        throw new Error('Stripe session missing URL');
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Unable to open checkout';
      setTopupError(err);
      setTopupBusy(false);
    }
  }

  useEffect(() => {
    if (preFilledDetails) {
      setCustomerFirstName(preFilledDetails.firstName);
      setCustomerPhoneLast4(preFilledDetails.phoneLast4);
    } else {
      setCustomerFirstName('');
      setCustomerPhoneLast4('');
    }
  }, [item.id, unitAllocation?.id, preFilledDetails]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-desert-dust)]/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#d1b7fb] bg-white p-6 text-[var(--color-outer-space)] shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Redeem reward</h3>
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
            {selectedPriceLabel ? <p className="mt-1 text-[11px] text-[var(--color-outer-space)]/60">Avg {selectedPriceLabel}</p> : null}
            {typeof unitAllocation.points === 'number' && typeof item.points === 'number' && unitAllocation.points !== item.points ? (
              <p className="mt-1 text-[11px] text-[var(--color-outer-space)]/60">This property requires {formatNumber(unitAllocation.points)} points.</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 space-y-2 text-sm text-[var(--color-outer-space)]/80">
          <div className="flex items-center justify-between">
            <span>Required points</span>
            <strong>{requiredPoints ? formatNumber(requiredPoints) : '—'} pts</strong>
          </div>
          <div className="flex items-center justify-between">
            <span>Your balance</span>
            <strong>{formatNumber(availablePoints)} pts</strong>
          </div>
        </div>

        {showSuccess ? (
          <div className="mt-8 flex flex-col items-center gap-6 text-center">
            <div className="animate-[redeemPop_320ms_ease-out]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50/40 text-emerald-600">
                <svg viewBox="0 0 52 52" className="h-9 w-9 text-current" aria-hidden>
                  <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.2" />
                  <path
                    d="M16 27.5 23.5 34l12.5-15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-[4] [stroke-dasharray:48] [stroke-dashoffset:48] animate-[redeemCheck_420ms_ease-out_forwards]"
                  />
                </svg>
              </div>
            </div>
            <div className="space-y-2 text-sm text-[var(--color-outer-space)]/80">
              <p className="text-base font-semibold text-[var(--color-outer-space)]">Request sent!</p>
              <p className="text-xs leading-snug text-[var(--color-outer-space)]/70">Expect your new balance to show up within the next minute.</p>
              <p className="text-[11px] leading-snug text-[var(--color-outer-space)]/60">
                We’ll email you once the fulfilment team approves this redemption. Feel free to continue browsing rewards.
              </p>
              {unitAllocation ? (
                <p className="text-[11px] leading-snug text-[var(--color-electric-purple)]/70">
                  Selected property: {unitAllocation.unitType || 'Allocation'}
                  {selectedPriceLabel ? ` · Avg ${selectedPriceLabel}` : ''}.
                </p>
              ) : null}
            </div>
            <button onClick={onClose} className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] sm:w-auto">
              Back to rewards
            </button>
          </div>
        ) : insufficient ? (
          <div className="mt-6 space-y-4 text-sm">
            <p>
              You need {formatNumber(requiredPoints - availablePoints)} more points to redeem this
              {unitAllocation ? ` ${unitAllocation.unitType || 'property option'}` : ' reward'}.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={handleDirectTopup}
                disabled={topupBusy}
                className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {topupBusy ? 'Redirecting…' : `Buy ${formatNumber(suggestedPoints)} pts (AED ${formatNumber(suggestedAed)})`}
              </button>
            </div>
            {topupError ? <p className="text-xs text-rose-500">{topupError}</p> : null}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {showError ? <p className="text-sm text-rose-500">{message}</p> : <p className="text-sm text-[var(--color-outer-space)]/70">Redeem this reward using {formatNumber(requiredPoints)} points?</p>}

            {preFilledDetails ? (
              <div className="rounded-[18px] border border-[var(--color-electric-purple)]/25 bg-[var(--color-panel)]/60 px-4 py-3 text-xs text-[var(--color-outer-space)]/80">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-electric-purple)]">Buyer verification</p>
                <div className="mt-2 space-y-1">
                  <p className="text-xs">
                    <span className="font-semibold">Name:</span> {preFilledDetails.firstName}
                  </p>
                  <p className="text-xs">
                    <span className="font-semibold">Phone (last 4):</span> {preFilledDetails.phoneLast4}
                  </p>
                </div>
              </div>
            ) : null}

            {item.termsActive ? (
              <div className="rounded-[18px] border border-[var(--color-electric-purple)]/25 bg-[var(--color-panel)]/60 px-4 py-3 text-xs text-[var(--color-outer-space)]/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--color-outer-space)]">Reward terms</span>
                  {onShowTerms ? (
                    <button
                      type="button"
                      onClick={() => onShowTerms(item)}
                      className="inline-flex items-center gap-1 text-[var(--color-electric-purple)] underline-offset-2 hover:underline"
                    >
                      View terms
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 leading-snug">
                  {termsSatisfied
                    ? 'You have accepted the terms for this reward. You can review them at any time.'
                    : 'Please review and accept the reward terms before confirming.'}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  onSubmit({
                    customerFirstName: trimmedFirstName,
                    customerPhoneLast4: trimmedPhone,
                  })
                }
                disabled={confirmDisabled}
                className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {busy ? 'Submitting…' : 'Confirm redeem'}
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full cursor-pointer rounded-full border border-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:bg-[var(--color-panel)]/80 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Close
              </button>
            </div>
            {!termsSatisfied ? <p className="text-[11px] text-rose-500">Accept the reward terms to continue.</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
