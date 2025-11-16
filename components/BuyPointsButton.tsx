'use client';

import { useMemo, useState } from 'react';
import { formatNumber } from '@/lib/format';

type Props = {
  agentId?: string | null;
  agentCode?: string | null;
  baseQuery?: string;
  minAmount: number;
  pointsPerAed: number;
  className?: string;
};

const quickMultipliers = [1, 2, 4];

export function BuyPointsButton({ agentId, agentCode, baseQuery, minAmount, pointsPerAed, className }: Props) {
  const [amountAED, setAmountAED] = useState(minAmount);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const expectedPoints = useMemo(() => amountAED * pointsPerAed, [amountAED, pointsPerAed]);

  async function handleCheckout() {
    if (!agentId && !agentCode) {
      setError('Agent is missing. Refresh and try again.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId, agentCode, amountAED, baseQuery }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to start checkout');
      if (json?.url) {
        window.location.href = json.url as string;
      } else {
        throw new Error('Stripe session missing URL');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex h-full w-full flex-col rounded-[22px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] p-5 text-[var(--color-outer-space)] sm:rounded-[28px] sm:p-6 ${
        className ? className : ''
      }`}
    >
      <div className="space-y-5 w-full sm:space-y-6">
        {/* Large Points Display */}
        <div className="rounded-[18px] border border-[var(--color-electric-purple)]/20 bg-white/60 px-4 py-5 text-center backdrop-blur-sm sm:px-6 sm:py-6">
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-outer-space)]/60 sm:text-sm">
            You&apos;ll receive
          </p>
          <p className="mt-2 text-[32px] font-bold leading-none text-[var(--color-electric-purple)] sm:mt-3 sm:text-[48px]">
            {formatNumber(expectedPoints)}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-outer-space)]/70 sm:text-sm">
            Points
          </p>
        </div>

        {/* Conversion Rate Info */}
        <div className="flex items-center justify-center gap-2 text-center">
          <div className="h-px flex-1 bg-[var(--color-outer-space)]/10" />
          <p className="text-[11px] font-medium text-[var(--color-outer-space)]/60 sm:text-xs">
            {formatNumber(pointsPerAed)} pts per AED · min AED {formatNumber(minAmount)}
          </p>
          <div className="h-px flex-1 bg-[var(--color-outer-space)]/10" />
        </div>

        {/* Quick Amount Selectors */}
        <div>
          <p className="mb-3 text-xs font-semibold text-[var(--color-outer-space)] sm:text-sm">Select amount</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {quickMultipliers.map((multiplier) => {
              const price = multiplier * minAmount;
              const active = amountAED === price;
              return (
                <button
                  key={multiplier}
                  type="button"
                  onClick={() => setAmountAED(price)}
                  aria-pressed={active}
                  className={`group relative cursor-pointer overflow-hidden rounded-[14px] border-2 px-3 py-3 text-center transition-all duration-200 sm:rounded-[18px] sm:px-4 sm:py-4 ${
                    active
                      ? 'border-[var(--color-electric-purple)] bg-[var(--color-electric-purple)] shadow-[0_8px_24px_-8px_rgba(127,90,240,0.4)]'
                      : 'border-[#d1b7fb] bg-white hover:border-[var(--color-electric-purple)]/40 hover:bg-[var(--color-electric-purple)]/5'
                  }`}
                >
                  <div className="relative z-10">
                    <p className={`text-[11px] font-medium uppercase tracking-wider ${active ? 'text-white/80' : 'text-[var(--color-outer-space)]/50'} sm:text-xs`}>
                      {multiplier}x
                    </p>
                    <p className={`mt-1 text-base font-bold leading-tight ${active ? 'text-white' : 'text-[var(--color-outer-space)]'} sm:text-lg`}>
                      {formatNumber(price)}
                    </p>
                    <p className={`text-[10px] font-semibold uppercase tracking-wider ${active ? 'text-white/80' : 'text-[var(--color-outer-space)]/50'} sm:text-xs`}>
                      AED
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Amount Input */}
        <div>
          <label className="flex flex-col gap-2 text-xs font-semibold text-[var(--color-outer-space)] sm:text-sm">
            Custom amount
            <input
              type="number"
              min={minAmount}
              step="1"
              value={amountAED}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= minAmount) {
                  setAmountAED(next);
                } else if (next > 0 && next < minAmount) {
                  setAmountAED(minAmount);
                }
              }}
              placeholder={`Enter amount (min ${formatNumber(minAmount)} AED)`}
              className="w-full rounded-[14px] border-2 border-[#d1b7fb] bg-white px-4 py-3 text-base text-[var(--color-outer-space)] transition focus:border-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/20 sm:rounded-[18px] sm:px-4 sm:py-3"
            />
          </label>
          <p className="mt-1.5 text-[10px] text-[var(--color-outer-space)]/50 sm:text-xs">
            Minimum amount: {formatNumber(minAmount)} AED
          </p>
        </div>

        {/* Error Message */}
        {error ? (
          <div className="rounded-[14px] border border-rose-400/60 bg-rose-50/80 px-4 py-3 text-center">
            <p className="text-xs font-medium text-rose-700 sm:text-sm">{error}</p>
          </div>
        ) : null}

        {/* Checkout Button */}
        <button
          type="button"
          onClick={handleCheckout}
          disabled={busy || (!agentId && !agentCode)}
          className="group relative w-full overflow-hidden rounded-[18px] bg-[var(--color-electric-purple)] px-6 py-4 text-base font-semibold text-white shadow-[0_12px_32px_-12px_rgba(127,90,240,0.5)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_16px_40px_-12px_rgba(127,90,240,0.6)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)] focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:rounded-[24px] sm:py-4 sm:text-lg"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {busy ? (
              <>
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Redirecting to Stripe...</span>
              </>
            ) : (
              <>
                <span>Proceed to Checkout</span>
                <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </span>
        </button>

        {/* Stripe Badge */}
        <div className="flex items-center justify-center gap-2 text-[10px] text-[var(--color-outer-space)]/40 sm:text-xs">
          <svg className="h-3 w-3 sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1-9h2v6h-2v-6zm0-4h2v2h-2V7z" />
          </svg>
          <span>Secure payment powered by Stripe</span>
        </div>
      </div>
    </div>
  );
}
