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
  pointsPerAed: number;
  formatAedFull: (value?: number | null) => string;
  startStripeCheckout: StripeCheckoutFn;
  autoRestore?: DamacAutoRestore;
  onAutoRestoreConsumed?: () => void;
  onClose: () => void;
  onSuccess?: () => void;
};

function normaliseTopupAmount(value: number): number {
  // For redemption shortfall, charge EXACT amount needed (no minimum enforcement)
  if (!Number.isFinite(value) || value <= 0) return 2; // Stripe minimum for AED
  return Math.ceil(value);
}

function formatTimeRemaining(ms: number | null): string {
  if (ms === null) return '';
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function DamacRedemptionFlow({
  item,
  agentId,
  agentCode,
  availablePoints,
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

  // Reservation system state
  const [reservationExpiry, setReservationExpiry] = useState<Date | null>(null);
  const [activeReservationId, setActiveReservationId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  /**
   * Release reservation lock on a unit allocation
   */
  const releaseReservation = useCallback(
    async (allocationId: string) => {
      if (!agentId && !agentCode) return;

      try {
        await fetch('/api/reservations/release', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            unitAllocationId: allocationId,
            agentId: agentId ?? agentCode ?? 'unknown',
          }),
        });
      } catch (error) {
        console.error('Failed to release reservation:', error);
        // Don't show error to user - this is cleanup, not critical
      }
    },
    [agentId, agentCode],
  );

  const closeFlow = useCallback(() => {
    // Release any active reservation before closing
    if (activeReservationId) {
      releaseReservation(activeReservationId);
    }

    setSelectedAllocationId(null);
    setSelectionDetails(null);
    setFlowStatus('idle');
    setFlowError(null);
    setConfirmedLer(null);
    setPendingSubmission(null);
    setInsufficientBalanceModal(null);
    setReservationExpiry(null);
    setActiveReservationId(null);
    setTimeRemaining(null);
    onClose();
  }, [onClose, activeReservationId, releaseReservation]);

  const handleDamacProceed = useCallback(
    async ({ allocation, lerCode }: { allocation: AllocationWithStatus; lerCode: string }) => {
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

      // Create reservation lock FIRST (5-minute window)
      // This ensures the unit is reserved before checking balance
      setFlowStatus('submitting');
      setFlowError(null);

      try {
        const reservationRes = await fetch('/api/reservations/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            unitAllocationId: allocation.id,
            agentId: agentId ?? agentCode ?? 'unknown',
            lerCode: lerCode,
            durationMinutes: 5,
          }),
        });
        const reservationData = await reservationRes.json();

        // Check for successful reservation
        const reservationOk = reservationRes.ok && reservationData.success;

        // If 409 conflict, check if this is OUR OWN reservation (from before Stripe auto-restore)
        // The SQL function now returns reservedBy so we can verify it's actually this agent
        const is409Conflict = reservationRes.status === 409;
        const currentAgentId = agentId ?? agentCode ?? 'unknown';
        const isOwnReservation = is409Conflict &&
          reservationData.message === 'Unit already reserved' &&
          reservationData.reservedBy === currentAgentId;  // FIXED: Check if WE own it

        if (!reservationOk) {
          if (isOwnReservation) {
            // This is our own reservation from before Stripe - continue with expiry time
            console.log('[DAMAC] Detected own reservation from auto-restore, continuing...');
            setActiveReservationId(allocation.id);
          } else {
            // Different agent has this unit or other error
            setFlowError(reservationData.message || 'Another agent is currently selecting this unit. Please choose a different one.');
            setFlowStatus('idle');
            setSelectedAllocationId(null);
            setSelectionDetails(null);
            return;
          }
        } else {
          // Fresh reservation created successfully
          setReservationExpiry(new Date(reservationData.expiresAt));
          setActiveReservationId(allocation.id);
        }

        // NOW check if user has enough points
        if (availablePoints < requiredPoints) {
          setFlowError(null);
          const shortfall = requiredPoints - availablePoints;
          const denominator = pointsPerAed > 0 ? pointsPerAed : 1;
          const suggestedAed = normaliseTopupAmount(Math.ceil(shortfall / denominator));
          setInsufficientBalanceModal({
            requiredPoints,
            availablePoints,
            shortfall,
            suggestedAed,
            allocation,
            catalogueAllocation: matchingAllocation,
            lerCode,
          });
          setFlowStatus('idle');
          return;
        }

        // Has enough points - proceed to confirmation
        setPendingSubmission({ allocation, catalogueAllocation: matchingAllocation, lerCode });
        setFlowStatus('idle');
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : 'Failed to reserve unit';
        setFlowError(errMessage + '. Please try again.');
        setFlowStatus('idle');
        // Clear selection so LER form closes and error is visible
        setSelectedAllocationId(null);
        setSelectionDetails(null);
      }
    },
    [agentCode, agentId, availablePoints, item.unitAllocations, pointsPerAed, setSelectedAllocationId, setSelectionDetails],
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
      setActiveReservationId(null);
      setReservationExpiry(null);
      setTimeRemaining(null);
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
    // Release reservation when user goes back
    if (activeReservationId) {
      releaseReservation(activeReservationId);
      setActiveReservationId(null);
      setReservationExpiry(null);
      setTimeRemaining(null);
    }
    setInsufficientBalanceModal(null);
    // Clear selection so user can select another unit
    setSelectedAllocationId(null);
    setSelectionDetails(null);
  }, [activeReservationId, releaseReservation]);

  const cancelPendingSubmission = useCallback(() => {
    // Release reservation when user cancels
    if (activeReservationId) {
      releaseReservation(activeReservationId);
      setActiveReservationId(null);
      setReservationExpiry(null);
      setTimeRemaining(null);
    }
    setPendingSubmission(null);
  }, [activeReservationId, releaseReservation]);

  // Countdown timer for reservation expiry
  useEffect(() => {
    if (!reservationExpiry) {
      setTimeRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const expiry = reservationExpiry.getTime();
      const remaining = Math.max(0, expiry - now);

      setTimeRemaining(remaining);

      if (remaining === 0) {
        // Reservation expired
        setFlowError('Your reservation has expired. Please select the unit again.');
        setPendingSubmission(null);
        setReservationExpiry(null);
        setActiveReservationId(null);
        setTimeRemaining(null);
      }
    }, 100); // Update every 100ms for smooth countdown

    return () => clearInterval(interval);
  }, [reservationExpiry]);

  // Cleanup reservation on unmount
  useEffect(() => {
    return () => {
      if (activeReservationId) {
        // Note: This cleanup might not always run (e.g., page refresh)
        // The server-side cron job will handle expiry
        releaseReservation(activeReservationId);
      }
    };
  }, [activeReservationId, releaseReservation]);

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

    const requiredPoints = allocation.points ?? null;
    if (requiredPoints && requiredPoints > availablePoints) {
      // Wait for ledger refresh after Stripe success before re-running the flow.
      return;
    }

    const allocationWithStatus: AllocationWithStatus = {
      id: allocation.id,
      points: allocation.points ?? undefined,
      unitType: allocation.unitType ?? undefined,
      priceAed: allocation.priceAed ?? undefined,
      propertyPrice: allocation.propertyPrice ?? undefined,
      plotAreaSqft: allocation.plotAreaSqft ?? undefined,
      saleableAreaSqft: allocation.saleableAreaSqft ?? undefined,
      damacIslandcode: allocation.damacIslandcode ?? undefined,
      brType: allocation.brType ?? undefined,
      availability: 'available',
    };

    handledAutoRestoreRef.current = key;
    setSelectedAllocationId(allocation.id);
    setSelectionDetails(allocationWithStatus);
    void handleDamacProceed({ allocation: allocationWithStatus, lerCode: autoRestore.lerCode });
    onAutoRestoreConsumed?.();
  }, [autoRestore, availablePoints, handleDamacProceed, item.unitAllocations, onAutoRestoreConsumed]);

  return (
    <>
      <div className="fixed inset-0 z-[65] bg-white">
        <div className="relative h-full w-full flex flex-col">
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

          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white px-4 pt-6 pb-24 sm:px-8 sm:pb-28 lg:px-10">
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
              <DamacMapSelector
                catalogueId={item.id}
                selectedAllocationId={selectedAllocationId}
                onSelectAllocation={setSelectedAllocationId}
                onSelectionChange={setSelectionDetails}
                onRequestProceed={handleDamacProceed}
                hideOuterFrame
              />
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

                  {/* Reservation countdown timer */}
                  {timeRemaining !== null && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
                      <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className={timeRemaining < 60000 ? 'font-semibold text-amber-700' : 'text-amber-700'}>
                        Reservation expires in {formatTimeRemaining(timeRemaining)}
                      </span>
                    </div>
                  )}

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
          timeRemaining={timeRemaining}
          formatTimeRemaining={formatTimeRemaining}
        />
      ) : null}
    </>
  );
}
