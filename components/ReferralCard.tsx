'use client';

import { useCallback, useState } from 'react';

type Props = {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryClick?: () => Promise<void> | void;
  primarySuccessLabel?: string;
  codeValue?: string | null;
  codeCopyLabel?: string;
  codeCopySuccessLabel?: string;
  onCodeCopy?: () => Promise<void> | void;
  className?: string;
};

export const REFERRAL_CARD_BASE_CLASS =
  'flex h-full w-full flex-col items-center gap-3 rounded-[16px] border border-[rgba(120,62,255,0.25)] bg-white/80 px-3.5 py-4 text-center text-[var(--color-outer-space)] shadow-[0_12px_35px_-30px_rgba(13,9,59,0.35)] backdrop-blur-[1px] sm:px-4 sm:py-5';

export function ReferralCard({
  title,
  description,
  primaryLabel,
  onPrimaryClick,
  primarySuccessLabel = 'Copied!',
  codeValue,
  codeCopyLabel = 'Copy',
  codeCopySuccessLabel = 'Copied!',
  onCodeCopy,
  className,
}: Props) {
  const [primaryCopied, setPrimaryCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handlePrimary = useCallback(async () => {
    if (!onPrimaryClick) return;
    await onPrimaryClick();
    if (!primarySuccessLabel) return;
    setPrimaryCopied(true);
    setTimeout(() => setPrimaryCopied(false), 1500);
  }, [onPrimaryClick, primarySuccessLabel]);

  const handleCodeCopy = useCallback(async () => {
    if (!onCodeCopy) return;
    await onCodeCopy();
    if (!codeCopySuccessLabel) return;
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }, [onCodeCopy, codeCopySuccessLabel]);

  const baseButtonClasses =
    'inline-flex min-h-[34px] items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition min-[420px]:px-5 min-[420px]:py-2.5 min-[420px]:text-sm';
  const primaryButtonClasses = `${baseButtonClasses} w-full border border-[var(--color-outer-space)] text-[var(--color-outer-space)] hover:bg-[var(--color-panel)] min-[420px]:w-auto`;

  const codeButtonClasses =
    'inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[11px] font-semibold text-[var(--color-electric-purple)] transition hover:bg-[var(--color-electric-purple)]/10 min-[420px]:px-2.5 min-[420px]:py-1 min-[420px]:text-xs';

  const cardClass = className ? `${REFERRAL_CARD_BASE_CLASS} ${className}` : REFERRAL_CARD_BASE_CLASS;

  return (
    <div className={cardClass}>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-semibold leading-tight min-[420px]:text-base">{title}</p>
        <p className="text-xs leading-snug text-[var(--color-outer-space)]/70 min-[420px]:text-sm">{description}</p>
      </div>
      <button type="button" onClick={handlePrimary} className={primaryButtonClasses}>
        {primaryCopied ? primarySuccessLabel : primaryLabel}
      </button>
      {codeValue ? (
        <div className="flex items-center gap-1.5 rounded-full border border-[rgba(120,62,255,0.18)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--color-outer-space)] min-[420px]:gap-2 min-[420px]:px-3 min-[420px]:py-1.5 min-[420px]:text-xs">
          <span className="font-mono text-[11px] tracking-wide min-[420px]:text-xs">{codeValue}</span>
          {onCodeCopy ? (
            <button type="button" onClick={handleCodeCopy} className={codeButtonClasses}>
              <CopyIcon className="h-3 w-3 min-[420px]:h-3.5 min-[420px]:w-3.5" />
              <span>{codeCopied ? codeCopySuccessLabel : codeCopyLabel}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type IconProps = {
  className?: string;
};

function CopyIcon({ className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H7Zm0 2h5v8H7V4Z" />
      <path d="M5 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1H9a4 4 0 0 1-4-4V6Z" />
    </svg>
  );
}
