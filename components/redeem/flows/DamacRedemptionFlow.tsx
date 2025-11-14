'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogueDisplayItem, CatalogueUnitAllocation } from '@/components/CatalogueGrid';
import { DamacMapSelector, type AllocationWithStatus } from '../DamacMapSelector';
import { DamacInsufficientBalanceModal } from '../components/DamacInsufficientBalanceModal';

type StripeCheckoutContext = {
  rewardId?: string;
  allocationId?: string;
  lerCode?: string;
};

type StripeCheckoutFn = (amountAED: number, context?: StripeCheckoutContext) => Promise<void>;

type DamacAutoRestore = {
  allocationId: string;
  lerCode: string;
} | null;

type DamacPendingSubmission = {
  allocation: AllocationWithStatus;
  catalogueAllocation: CatalogueUnitAllocation;
  lerCode: string;
};

type DamacInsufficientBalanceState = {
  requiredPoints: number;
  availablePoints: number;
  shortfall: number;
  suggestedAed: number;
  allocation: AllocationWithStatus;
  catalogueAllocation: CatalogueUnitAllocation;
  lerCode: string;
};

type DamacRedemptionFlowProps = {
  item: CatalogueDisplayItem;
  agentId?: string;
  agentCode?: string;
  availablePoints: number;
  minTopup: number;
  pointsPerAed: number;
  formatAedFull: (value?: number | null) => string;
  startStripeCheckout: StripeCheckoutFn;
  autoRestore?: DamacAutoRestore;
  onAutoRestoreConsumed?: () => void;
  onClose: () => void;
  onSuccess?: () => void;
};

function normaliseTopupAmount(value: number, minAmount: number): number {
  if (!Number.isFinite(value) || value <= 0) return minAmount;
  const multiples = Math.max(1, Math.ceil(value / minAmount));
  return multiples * minAmount;
}

export function DamacRedemptionFlow({
  item,
  agentId,
  agentCode,
  availablePoints,
  minTopup,
  pointsPerAed,
  formatAedFull,
  startStripeCheckout,
  autoRestore,
  onAutoRestoreConsumed,
  onClose,
  onSuccess,
}: DamacRedemptionFlowProps) {
  const [selectedAllocationId, setSelectedAllocationId] = useState<string | null>(null);
  const [selectionDetails, setSelectionDetails] = useState<AllocationWithStatus | null>(null);
  const [flowStatus, setFlowStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [flowError, setFlowError] = useState<string | null>(null);
  const [confirmedLer, setConfirmedLer] = useState<string | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<DamacPendingSubmission | null>(null);
  const [insufficientBalanceModal, setInsufficientBalanceModal] = useState<DamacInsufficientBalanceState | null>(null);
  const handledAutoRestoreRef = useRef<string | null>(null);

  const closeFlow = useCallback(() => {
    setSelectedAllocationId(null);
    setSelectionDetails(null);
    setFlowStatus('idle');
    setFlowError(null);
    setConfirmedLer(null);
    setPendingSubmission(null);
    setInsufficientBalanceModal(null);
    onClose();
  }, [onClose]);

  const handleDamacProceed = useCallback(
    ({ allocation, lerCode }: { allocation: AllocationWithStatus; lerCode: string }) => {
      const matchingAllocation =
        item.unitAllocations.find((unit) => unit.id === allocation.id) ?? null;
      if (!matchingAllocation) {
        setFlowError('Selected unit is no longer available. Please pick another option.');
        setSelectedAllocationId(null);
        setSelectionDetails(null);
        return;
      }

      const requiredPoints =
        typeof matchingAllocation.points === 'number'
          ? matchingAllocation.points
          : typeof allocation.points === 'number'
            ? allocation.points
            : null;
      if (!requiredPoints || requiredPoints <= 0) {
        setFlowError('This unit is missing a points value. Please choose another unit.');
        return;
      }
      if (!agentId && !agentCode) {
        setFlowError('Missing agent identifiers.');
        return;
      }

      if (availablePoints < requiredPoints) {
        setFlowError(null);
        const shortfall = requiredPoints - availablePoints;
        const denominator = pointsPerAed > 0 ? pointsPerAed : 1;
        const suggestedAed = normaliseTopupAmount(Math.ceil(shortfall / denominator), minTopup);
        setInsufficientBalanceModal({
          requiredPoints,
          availablePoints,
          shortfall,
          suggestedAed,
          allocation,
          catalogueAllocation: matchingAllocation,
          lerCode,
        });
        return;
      }

      setFlowError(null);
      setPendingSubmission({ allocation, catalogueAllocation: matchingAllocation, lerCode });
    },
    [agentCode, agentId, availablePoints, item.unitAllocations, minTopup, pointsPerAed],
  );

  const submitDamacRedemption = useCallback(async () => {
    if (!pendingSubmission) return;
    const { catalogueAllocation, allocation, lerCode } = pendingSubmission;

    const requiredPoints = catalogueAllocation.points ?? null;
    if (requiredPoints && requiredPoints > 0 && availablePoints < requiredPoints) {
      setFlowError(
        `Insufficient balance. You need ${requiredPoints.toLocaleString()} points but only have ${availablePoints.toLocaleString()} points.`,
      );
      setPendingSubmission(null);
      return;
    }

    setFlowStatus('submitting');
    setFlowError(null);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId ?? null,
          agentCode: agentCode ?? null,
          rewardId: item.id,
          rewardName: item.name,
          rewardPoints: catalogueAllocation.points ?? item.points ?? null,
          priceAed: catalogueAllocation.priceAed ?? item.priceAED ?? null,
          unitAllocationId: catalogueAllocation.id,
          unitAllocationLabel: catalogueAllocation.unitType ?? allocation.damacIslandcode ?? null,
          unitAllocationPoints: catalogueAllocation.points ?? null,
          damacLerReference: lerCode,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string })?.error || 'Redemption failed');
      }
      setConfirmedLer(lerCode);
      setPendingSubmission(null);
      setFlowStatus('success');
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unable to submit redemption';
      setFlowError(errMessage);
      setFlowStatus('idle');
    }
  }, [agentCode, agentId, availablePoints, item.id, item.name, item.points, item.priceAED, pendingSubmission]);

  const handleBuyPointsForDamac = useCallback(async () => {
    if (!insufficientBalanceModal) return;
    setFlowStatus('submitting');
    setFlowError(null);
    try {
      await startStripeCheckout(insufficientBalanceModal.suggestedAed, {
        rewardId: item.id,
        allocationId: insufficientBalanceModal.allocation.id,
        lerCode: insufficientBalanceModal.lerCode,
      });
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Unable to open checkout';
      setFlowError(errMessage);
      setFlowStatus('idle');
    } finally {
      setInsufficientBalanceModal(null);
    }
  }, [insufficientBalanceModal, item.id, startStripeCheckout]);

  const closeInsufficientBalanceModal = useCallback(() => {
    setInsufficientBalanceModal(null);
  }, []);

  const cancelPendingSubmission = useCallback(() => {
    setPendingSubmission(null);
  }, []);

  useEffect(() => {
    if (flowStatus === 'success') {
      onSuccess?.();
    }
  }, [flowStatus, onSuccess]);

  useEffect(() => {
    setPendingSubmission(null);
  }, [selectedAllocationId]);

  useEffect(() => {
    if (!pendingSubmission) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const timer = window.setTimeout(() => {
      const card = document.querySelector('[class*="CONFIRM"][class*="REDEMPTION"]');
      if (!card) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [pendingSubmission]);

  useEffect(() => {
    if (!autoRestore || !autoRestore.allocationId || !autoRestore.lerCode) return;
    const key = `${autoRestore.allocationId}:${autoRestore.lerCode}`;
    if (handledAutoRestoreRef.current === key) return;
    const allocation = item.unitAllocations.find((unit) => unit.id === autoRestore.allocationId);
    if (!allocation) return;

    const allocationWithStatus: AllocationWithStatus = {
      id: allocation.id,
      points: allocation.points ?? undefined,
      unitType: allocation.unitType ?? undefined,
      priceAed: allocation.priceAed ?? undefined,
      propertyPrice: allocation.propertyPrice ?? undefined,
      availability: 'available',
    };

    handledAutoRestoreRef.current = key;
    setSelectedAllocationId(allocation.id);
    setSelectionDetails(allocationWithStatus);
    setPendingSubmission({
      allocation: allocationWithStatus,
      catalogueAllocation: allocation,
      lerCode: autoRestore.lerCode,
    });
    onAutoRestoreConsumed?.();
  }, [autoRestore, item.unitAllocations, onAutoRestoreConsumed]);

  return (
    <>
      <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[var(--color-desert-dust)]/80 px-2 py-4 backdrop-blur-sm">
        <div className="relative w-full max-w-6xl rounded-[32px] border border-[#d1b7fb] bg-white shadow-[0_40px_90px_-45px_rgba(13,9,59,0.65)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d1b7fb]/60 px-6 py-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-electric-purple)]">Damac Islands</p>
              <h3 className="text-2xl font-semibold text-[var(--color-outer-space)]">{item.name}</h3>
              <p className="text-sm text-[var(--color-outer-space)]/70">
                {selectionDetails
                  ? `Selected ${selectionDetails.damacIslandcode || selectionDetails.unitType || 'unit'}`
                  : 'Select a unit to continue'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeFlow}
              className="rounded-full border border-[var(--color-outer-space)]/20 px-4 py-1.5 text-sm font-medium text-[var(--color-outer-space)]/70 transition hover:border-[var(--color-outer-space)]/60 hover:text-[var(--color-outer-space)]"
            >
              Close
            </button>
          </div>

          {flowError ? (
            <div className="mx-6 mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{flowError}</div>
          ) : null}

          <div className="max-h-[80vh] overflow-y-auto px-4 pt-6 pb-24 sm:px-8 sm:pb-28 lg:px-10">
            {flowStatus === 'success' ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="w-full max-w-lg space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
                    <svg viewBox="0 0 52 52" className="h-8 w-8 text-current" aria-hidden>
                      <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.2" />
                      <path
                        d="M16 27.5 23.5 34l12.5-15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h4 className="text-xl font-semibold text-[var(--color-outer-space)]">Request received</h4>
                  <p className="text-sm text-[var(--color-outer-space)]/70">
                    {confirmedLer ? `LER ${confirmedLer} is now locked.` : 'Your token request has been locked.'} Our team will finalize the allocation shortly.
                  </p>
                  <button
                    type="button"
                    onClick={closeFlow}
                    className="rounded-full bg-[var(--color-outer-space)] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c]"
                  >
                    Back to store
                  </button>
                </div>
              </div>
            ) : !pendingSubmission ? (
              <div className="overflow-hidden rounded-[32px] border border-[#d1b7fb]/80 bg-white/95 p-4 sm:p-6">
                <DamacMapSelector
                  catalogueId={item.id}
                  selectedAllocationId={selectedAllocationId}
                  onSelectAllocation={setSelectedAllocationId}
                  onSelectionChange={setSelectionDetails}
                  onRequestProceed={handleDamacProceed}
                  hideOuterFrame
                />
              </div>
            ) : (
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="w-full max-w-lg rounded-[28px] border border-[#d1b7fb]/70 bg-white px-5 py-5 text-[var(--color-outer-space)] shadow-[0_25px_70px_-50px_rgba(13,9,59,0.65)] sm:px-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-electric-purple)]">Confirm redemption</p>
                  <h4 className="mt-2 text-xl font-semibold">
                    {pendingSubmission.allocation.damacIslandcode ||
                      pendingSubmission.catalogueAllocation.unitType ||
                      'Selected unit'}
                  </h4>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">Points required</dt>
                      <dd className="mt-1 text-lg font-semibold">
                        {pendingSubmission.catalogueAllocation.points?.toLocaleString() ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">Price</dt>
                      <dd className="mt-1 text-lg font-semibold">
                        {formatAedFull(
                          pendingSubmission.catalogueAllocation.propertyPrice ??
                            pendingSubmission.catalogueAllocation.priceAed ??
                            pendingSubmission.allocation.propertyPrice ??
                            pendingSubmission.allocation.priceAed ??
                            null,
                        )}
                      </dd>
                    </div>
                    {pendingSubmission.allocation.brType ? (
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">Prototype</dt>
                        <dd className="mt-1 text-base font-semibold">{pendingSubmission.allocation.brType}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-outer-space)]/60">LER</dt>
                      <dd className="mt-1 text-base font-semibold">{pendingSubmission.lerCode}</dd>
                    </div>
                  </dl>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={cancelPendingSubmission}
                      className="inline-flex items-center justify-center rounded-full border border-[var(--color-outer-space)]/20 px-5 py-2.5 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:border-[var(--color-outer-space)]/50 hover:text-[var(--color-outer-space)]"
                      disabled={flowStatus === 'submitting'}
                    >
                      Change selection
                    </button>
                    <button
                      type="button"
                      onClick={submitDamacRedemption}
                      disabled={flowStatus === 'submitting'}
                      className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-[var(--color-outer-space)] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:opacity-60"
                    >
                      {flowStatus === 'submitting' ? 'Submitting…' : 'Confirm & redeem'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {flowStatus === 'submitting' ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[32px] bg-white/70 text-center text-sm font-semibold text-[var(--color-outer-space)]">
              Processing your request…
            </div>
          ) : null}
        </div>
      </div>

      {insufficientBalanceModal ? (
        <DamacInsufficientBalanceModal
          requiredPoints={insufficientBalanceModal.requiredPoints}
          availablePoints={insufficientBalanceModal.availablePoints}
          shortfall={insufficientBalanceModal.shortfall}
          suggestedAed={insufficientBalanceModal.suggestedAed}
          pointsPerAed={pointsPerAed}
          formatAedFull={formatAedFull}
          isSubmitting={flowStatus === 'submitting'}
          onBuyPoints={handleBuyPointsForDamac}
          onGoBack={closeInsufficientBalanceModal}
        />
      ) : null}
    </>
  );
}
