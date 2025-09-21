import React from 'react';

type Props = {
  status: 'success' | 'cancel';
};

export function TopupBanner({ status }: Props) {
  const isSuccess = status === 'success';
  const tone = isSuccess
    ? 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
    : 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200';

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <span className="text-lg" aria-hidden>{isSuccess ? '✨' : '⚠️'}</span>
      <div>
        <p className="font-semibold">{isSuccess ? 'Top-up successful!' : 'Top-up cancelled'}</p>
        <p className="text-xs opacity-80">
          {isSuccess
            ? 'Stripe confirmed the payment. Airtable will receive the webhook and post the points shortly.'
            : 'No charge was made. You can try again whenever you are ready.'}
        </p>
      </div>
    </div>
  );
}

