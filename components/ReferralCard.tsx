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
  const buttonsClasses = showSecondary
    ? 'flex flex-wrap items-center gap-2 min-[520px]:justify-end'
    : 'flex items-center justify-start gap-2 min-[520px]:justify-end';

  return (
    <div className="flex h-full w-full flex-col justify-between gap-4 rounded-[26px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] px-4 py-4 text-left text-[var(--color-outer-space)] shadow-[0_25px_60px_-45px_rgba(13,9,59,0.35)] backdrop-blur-[2px]">
      <div className="flex flex-col items-start gap-2 min-[420px]:flex-row min-[420px]:items-start min-[420px]:gap-3">
        <span aria-hidden className="text-xl min-[520px]:text-2xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold min-[520px]:text-base">{title}</p>
          <p className="mt-1 text-xs text-[var(--color-outer-space)]/70 min-[520px]:text-sm">{description}</p>
        </div>
      </div>
      <div className={buttonsClasses}>
        <button
          type="button"
          onClick={handlePrimary}
          className="inline-flex w-full min-h-[36px] items-center justify-center gap-2 rounded-full border border-[var(--color-outer-space)] px-3 py-1.5 text-xs font-semibold text-[var(--color-outer-space)] transition hover:bg-[var(--color-panel)] min-[520px]:w-auto min-[520px]:text-sm"
        >
          {primaryCopied ? primarySuccessLabel : primaryLabel}
        </button>
        {secondaryLabel ? (
          <button
            type="button"
            onClick={handleSecondary}
            className="inline-flex w-full min-h-[36px] items-center justify-center gap-2 rounded-full border border-transparent bg-[var(--color-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--color-outer-space)] transition hover:border-[var(--color-outer-space)]/20 hover:bg-[rgba(246,243,248,0.85)] min-[520px]:w-auto min-[520px]:text-sm"
          >
            {secondaryCopied ? secondarySuccessLabel : secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
