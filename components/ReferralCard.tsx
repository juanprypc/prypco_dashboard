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

  const showSecondary = Boolean(secondaryLabel);
  const baseButtonClasses =
    'inline-flex w-full min-h-[40px] items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition sm:w-auto';
  const primaryButtonClasses = `${baseButtonClasses} border border-[var(--color-outer-space)] text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]`;
  const secondaryButtonClasses = `${baseButtonClasses} border border-transparent bg-[var(--color-panel)] text-[var(--color-outer-space)] hover:border-[var(--color-outer-space)]/20 hover:bg-[rgba(246,243,248,0.85)]`;

  return (
    <div className="flex h-full w-full flex-col gap-5 rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] px-4 py-5 text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] backdrop-blur-[2px]">
      <div className="flex flex-col gap-3 text-left sm:flex-row sm:items-start sm:gap-4">
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d1b7fb]/60 bg-white text-xl">
          {icon}
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold leading-tight">{title}</p>
          <p className="text-sm leading-snug text-[var(--color-outer-space)]/70">{description}</p>
        </div>
      </div>
      <div
        className={`mt-auto flex w-full flex-col gap-2 ${
          showSecondary
            ? 'sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2'
            : 'sm:flex-row sm:justify-end'
        }`}
      >
        <button
          type="button"
          onClick={handlePrimary}
          className={primaryButtonClasses}
        >
          {primaryCopied ? primarySuccessLabel : primaryLabel}
        </button>
        {secondaryLabel ? (
          <button
            type="button"
            onClick={handleSecondary}
            className={secondaryButtonClasses}
          >
            {secondaryCopied ? secondarySuccessLabel : secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
