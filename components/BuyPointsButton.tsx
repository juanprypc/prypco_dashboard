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

function normaliseAmount(value: number, min: number) {
  if (!Number.isFinite(value) || value <= 0) return min;
  const multiples = Math.max(1, Math.ceil(value / min));
  return multiples * min;
}

export function BuyPointsButton({ agentId, agentCode, baseQuery, minAmount, pointsPerAed, className }: Props) {
  const [amountAED, setAmountAED] = useState(() => normaliseAmount(minAmount, minAmount));
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
      className={`flex h-full w-full flex-col items-start justify-between rounded-[22px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] p-4 text-[var(--color-outer-space)] sm:rounded-[28px] sm:p-6 ${
        className ? className : ''
      }`}
    >
      <div className="space-y-4 w-full">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--color-outer-space)]/70 sm:text-sm">Top up points</p>
          <p className="text-[11px] text-[var(--color-outer-space)]/60 sm:text-xs">
            {formatNumber(pointsPerAed)} pts per AED · minimum AED {formatNumber(minAmount)}
          </p>
        </div>

        <div className="flex flex-wrap justify-start gap-2">
          {quickMultipliers.map((multiplier) => {
            const price = multiplier * minAmount;
            const active = amountAED === price;
            return (
              <button
                key={multiplier}
                type="button"
                onClick={() => setAmountAED(price)}
                className={`cursor-pointer rounded-full border px-3 py-[6px] text-[11px] font-semibold transition ${
                  active
                    ? 'border-[var(--color-outer-space)] bg-[var(--color-outer-space)] text-white'
                    : 'border-[#d1b7fb] bg-white text-[var(--color-outer-space)] hover:bg-white/80'
                }`}
              >
                AED {formatNumber(price)}
              </button>
            );
          })}
        </div>

        <label className="flex flex-col gap-2 text-xs font-medium text-[var(--color-outer-space)] sm:text-sm">
          Custom amount (in {formatNumber(minAmount)} AED steps)
          <input
            type="number"
            min={minAmount}
            step={minAmount}
            value={amountAED}
            onChange={(event) => {
              const next = Number(event.target.value);
              setAmountAED(normaliseAmount(next, minAmount));
            }}
            className="w-full rounded-[14px] border border-[#d1b7fb] bg-white px-3 py-2 text-sm text-[var(--color-outer-space)] focus:border-[var(--color-outer-space)] focus:outline-none focus:ring-2 focus:ring-[var(--color-outer-space)]/15"
          />
        </label>

      </div>

      {error ? <p className="mt-2 w-full text-center text-xs text-rose-500 sm:text-left">{error}</p> : null}

      <button
        type="button"
        onClick={handleCheckout}
        disabled={busy || (!agentId && !agentCode)}
        className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-outer-space)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] focus:outline-none focus:ring-2 focus:ring-[var(--color-outer-space)]/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Redirecting…' : `Buy ${formatNumber(expectedPoints)} pts`}
      </button>
    </div>
  );
}
