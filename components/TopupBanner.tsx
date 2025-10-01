import React from 'react';

type Props = {
  status: 'success' | 'cancel';
};

export function TopupBanner({ status }: Props) {
  const isSuccess = status === 'success';

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[24px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] px-4 py-4 text-sm text-[var(--color-outer-space)] shadow-[0_18px_45px_-40px_rgba(13,9,59,0.35)]"
    >
      <span
        aria-hidden
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-current text-sm font-semibold ${
          isSuccess ? 'text-emerald-600/80' : 'text-amber-600/80'
        }`}
      >
        {isSuccess ? '✓' : '!'}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          {isSuccess ? 'Top-up confirmed' : 'Top-up cancelled'}
        </p>
        <p className="text-xs leading-snug text-[var(--color-outer-space)]/70">
          {isSuccess
            ? 'Expect your new balance to show up within the next minute.'
            : 'No points were added and your card was not charged. Feel free to try again when you’re ready.'}
        </p>
      </div>
    </div>
  );
}
