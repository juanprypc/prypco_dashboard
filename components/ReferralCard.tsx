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
    'inline-flex w-full min-h-[36px] items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition min-[360px]:w-auto min-[480px]:px-4 min-[480px]:py-2 min-[480px]:text-sm';
  const primaryButtonClasses = `${baseButtonClasses} border border-[var(--color-outer-space)] text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]`;
  const secondaryButtonClasses = `${baseButtonClasses} border border-transparent bg-[var(--color-panel)] text-[var(--color-outer-space)] hover:border-[var(--color-outer-space)]/20 hover:bg-[rgba(246,243,248,0.85)]`;

  return (
    <div className="flex h-full w-full flex-col gap-5 rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] px-4 py-5 text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 text-center min-[360px]:flex-row min-[360px]:items-start min-[360px]:gap-4 min-[360px]:text-left">
        <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d1b7fb]/60 bg-white text-lg min-[360px]:h-11 min-[360px]:w-11 min-[480px]:h-12 min-[480px]:w-12 min-[480px]:text-xl">
          {icon}
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold leading-tight min-[360px]:text-base">{title}</p>
          <p className="text-xs leading-snug text-[var(--color-outer-space)]/70 min-[360px]:text-sm">{description}</p>
        </div>
      </div>
      <div
        className={`mt-auto flex w-full flex-col gap-2 ${
          showSecondary
            ? 'min-[360px]:flex-row min-[360px]:flex-wrap min-[360px]:gap-2 min-[360px]:justify-end'
            : 'min-[360px]:flex-row min-[360px]:justify-end'
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
