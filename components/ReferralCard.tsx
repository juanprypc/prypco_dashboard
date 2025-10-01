'use client';

import { useCallback, useState } from 'react';

type Props = {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryClick?: () => Promise<void> | void;
  secondaryLabel?: string;
  onSecondaryClick?: () => Promise<void> | void;
  primarySuccessLabel?: string;
  secondarySuccessLabel?: string;
  className?: string;
};

export const REFERRAL_CARD_BASE_CLASS =
  'flex h-full w-full flex-col items-center justify-between gap-3 rounded-[20px] border border-[#d1b7fb] bg-[var(--color-panel-soft)] px-3 py-4 text-center text-[var(--color-outer-space)] shadow-[0_18px_45px_-35px_rgba(13,9,59,0.35)] backdrop-blur-[2px]';

export function ReferralCard({
  title,
  description,
  primaryLabel,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick,
  primarySuccessLabel = 'Copied!',
  secondarySuccessLabel = 'Copied!',
  className,
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
    'inline-flex w-full min-h-[34px] items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition min-[360px]:w-auto min-[420px]:px-3.5 min-[420px]:py-2.5 min-[420px]:text-sm';
  const primaryButtonClasses = `${baseButtonClasses} border border-[var(--color-outer-space)] text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]`;
  const secondaryButtonClasses = `${baseButtonClasses} border border-transparent bg-[var(--color-panel)] text-[var(--color-outer-space)] hover:border-[var(--color-outer-space)]/20 hover:bg-[rgba(246,243,248,0.85)]`;

  const cardClass = className ? `${REFERRAL_CARD_BASE_CLASS} ${className}` : REFERRAL_CARD_BASE_CLASS;

  return (
    <div className={cardClass}>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="space-y-1">
          <p className="text-sm font-semibold leading-tight min-[420px]:text-base">{title}</p>
          <p className="text-xs leading-snug text-[var(--color-outer-space)]/70 min-[420px]:text-sm">{description}</p>
        </div>
      </div>
      <div
        className={`mt-auto flex w-full flex-col gap-2 ${
          showSecondary
            ? 'min-[360px]:flex-row min-[360px]:flex-wrap min-[360px]:justify-center min-[360px]:gap-2'
            : 'min-[360px]:flex-row min-[360px]:justify-center'
        }`}
      >
        <button type="button" onClick={handlePrimary} className={primaryButtonClasses}>
          {primaryCopied ? primarySuccessLabel : primaryLabel}
        </button>
        {secondaryLabel ? (
          <button type="button" onClick={handleSecondary} className={secondaryButtonClasses}>
            {secondaryCopied ? secondarySuccessLabel : secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
