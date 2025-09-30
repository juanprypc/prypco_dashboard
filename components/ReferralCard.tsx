'use client';

import { useCallback, useState } from 'react';

type Props = {
  icon?: string;
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryClick?: () => Promise<void> | void;
  secondaryLabel?: string;
  onSecondaryClick?: () => Promise<void> | void;
  primarySuccessLabel?: string;
  secondarySuccessLabel?: string;
};

export function ReferralCard({
  icon = '✨',
  title,
  description,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick,
  primarySuccessLabel = 'Copied!',
  secondarySuccessLabel = 'Copied!',
}: Props) {
  const [primaryCopied, setPrimaryCopied] = useState(false);
  const [secondaryCopied, setSecondaryCopied] = useState(false);

  const handlePrimary = useCallback(async () => {
    if (!onPrimaryClick) return;
    await onPrimaryClick();
    if (!primarySuccessLabel) return;
    setPrimaryCopied(true);
    setTimeout(() => setPrimaryCopied(false), 1500);
  }, [onPrimaryClick, primarySuccessLabel]);

  const handleSecondary = useCallback(async () => {
    if (!onSecondaryClick) return;
    await onSecondaryClick();
    if (!secondarySuccessLabel) return;
    setSecondaryCopied(true);
    setTimeout(() => setSecondaryCopied(false), 1500);
  }, [onSecondaryClick, secondarySuccessLabel]);

  return (
    <div className="flex w-full flex-col gap-3 rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] p-4 text-left text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] backdrop-blur-[2px] sm:h-full sm:min-h-[200px] sm:gap-4 sm:p-5 xl:max-w-[280px]">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-xl sm:text-2xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold sm:text-base">{title}</p>
          <p className="mt-1 text-xs text-[var(--color-outer-space)]/70 sm:text-sm">{description}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:mt-auto sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handlePrimary}
          className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-full border border-[var(--color-outer-space)] px-3 py-1.5 text-xs font-semibold text-[var(--color-outer-space)] transition hover:bg-[var(--color-panel)] sm:text-sm"
        >
          {primaryCopied ? primarySuccessLabel : primaryLabel}
        </button>
        {secondaryLabel ? (
          <button
            type="button"
            onClick={handleSecondary}
            className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-full border border-transparent bg-[var(--color-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--color-outer-space)] transition hover:border-[var(--color-outer-space)]/20 hover:bg-[rgba(246,243,248,0.85)] sm:text-sm"
          >
            {secondaryCopied ? secondarySuccessLabel : secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
