'use client';

type DamacInsufficientBalanceModalProps = {
  requiredPoints: number;
  availablePoints: number;
  shortfall: number;
  suggestedAed: number;
  pointsPerAed: number;
  formatAedFull: (value?: number | null) => string;
  isSubmitting: boolean;
  onBuyPoints: () => void;
  onGoBack: () => void;
  timeRemaining: number | null;
  formatTimeRemaining: (ms: number | null) => string;
};

export function DamacInsufficientBalanceModal({
  requiredPoints,
  availablePoints,
  shortfall,
  suggestedAed,
  pointsPerAed,
  formatAedFull,
  isSubmitting,
  onBuyPoints,
  onGoBack,
  timeRemaining,
  formatTimeRemaining,
}: DamacInsufficientBalanceModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-[24px] border border-[#d1b7fb]/70 bg-white p-6 text-[var(--color-outer-space)] shadow-[0_30px_80px_-40px_rgba(13,9,59,0.7)]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-50 text-amber-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-7 w-7" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-[var(--color-outer-space)]">Insufficient Points</h3>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-outer-space)]/70">
            You don&apos;t have enough points for this unit. Buy more points to continue with your redemption.
          </p>

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

          <div className="mt-5 space-y-2 rounded-[16px] border border-[#d1b7fb]/50 bg-[#f8f5ff] px-4 py-3.5 text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--color-outer-space)]/60">Required:</span>
              <span className="font-semibold text-[var(--color-outer-space)]">{requiredPoints.toLocaleString()} points</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--color-outer-space)]/60">You have:</span>
              <span className="font-semibold text-[var(--color-outer-space)]">{availablePoints.toLocaleString()} points</span>
            </div>
            <div className="mt-2 border-t border-[#d1b7fb]/40 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[var(--color-outer-space)]/60">You need:</span>
                <span className="font-bold text-[var(--color-electric-purple)]">{shortfall.toLocaleString()} more points</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-[var(--color-outer-space)]/50">
            Suggested top-up: {formatAedFull(suggestedAed)} ({(suggestedAed * pointsPerAed).toLocaleString()} points)
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onBuyPoints}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-[var(--color-outer-space)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:opacity-60"
          >
            {isSubmitting ? 'Processing…' : 'Buy Points'}
          </button>
          <button
            type="button"
            onClick={onGoBack}
            disabled={isSubmitting}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-[var(--color-outer-space)]/20 px-6 py-3 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:border-[var(--color-outer-space)]/50 hover:text-[var(--color-outer-space)] disabled:opacity-60"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
