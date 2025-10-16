'use client';

import { useCallback, useState } from 'react';
import { emitAnalyticsEvent } from '@/lib/clientAnalytics';

type Props = {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryClick?: () => Promise<void> | void;
  primarySuccessLabel?: string | null;
  codeValue?: string | null;
  codeCopyLabel?: string;
  codeCopySuccessLabel?: string;
  onCodeCopy?: () => Promise<void> | void;
  className?: string;
  analyticsAgentId?: string;
  analyticsShareVariant?: string;
  analyticsCopyVariant?: string;
};

export const REFERRAL_CARD_BASE_CLASS =
  'flex h-full w-full flex-col items-center gap-3 rounded-[18px] border border-[rgba(120,62,255,0.24)] bg-[var(--color-background)] px-4 py-4 text-center text-[var(--color-outer-space)] shadow-[0_4px_18px_-16px_rgba(13,9,59,0.28)] transition-shadow duration-300 sm:gap-4 sm:px-5 sm:py-5 hover:shadow-[0_10px_30px_-18px_rgba(13,9,59,0.32)]';

export function ReferralCard({
  title,
  description,
  primaryLabel,
  onPrimaryClick,
  primarySuccessLabel = null,
  codeValue,
  codeCopyLabel = 'Tap to copy',
  codeCopySuccessLabel = 'Copied!',
  onCodeCopy,
  className,
  analyticsAgentId,
  analyticsShareVariant,
  analyticsCopyVariant,
}: Props) {
  const [primaryCopied, setPrimaryCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handlePrimary = useCallback(async () => {
    if (!onPrimaryClick) return;
    emitAnalyticsEvent('referral_link_clicked', {
      agent_id: analyticsAgentId ?? 'unknown',
      referral_variant: analyticsShareVariant ?? 'primary',
    });
    await onPrimaryClick();
    if (!primarySuccessLabel) return;
    setPrimaryCopied(true);
    setTimeout(() => setPrimaryCopied(false), 1500);
  }, [analyticsAgentId, analyticsShareVariant, onPrimaryClick, primarySuccessLabel]);

  const handleCodeCopy = useCallback(async () => {
    if (!onCodeCopy) return;
    emitAnalyticsEvent('referral_code_copied', {
      agent_id: analyticsAgentId ?? 'unknown',
      referral_variant: analyticsCopyVariant ?? 'code',
    });
    await onCodeCopy();
    if (!codeCopySuccessLabel) return;
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }, [analyticsAgentId, analyticsCopyVariant, codeCopySuccessLabel, onCodeCopy]);

  const shareButtonClasses =
    'inline-flex w-full min-h-[38px] items-center justify-center rounded-[14px] border border-[var(--color-outer-space)] bg-white/75 px-4 py-2 text-sm font-semibold text-[var(--color-outer-space)] shadow-[0_12px_28px_-18px_rgba(13,9,59,0.35)] transition hover:bg-[var(--color-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-electric-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-white min-[420px]:py-2.5';

  const copyButtonClasses =
    'group flex w-full items-center justify-between rounded-[14px] border border-[rgba(120,62,255,0.25)] bg-[var(--color-panel)]/70 px-3 py-1.5 text-[11px] font-semibold text-[var(--color-outer-space)] shadow-[0_10px_24px_-20px_rgba(13,9,59,0.4)] transition hover:bg-[var(--color-electric-purple)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-electric-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-white min-[420px]:py-2 min-[420px]:text-xs';

  const cardClass = className ? `${REFERRAL_CARD_BASE_CLASS} ${className}` : REFERRAL_CARD_BASE_CLASS;
  const primaryLabelText = primaryCopied && primarySuccessLabel ? primarySuccessLabel : primaryLabel;

  return (
    <div className={cardClass}>
      <div className="flex w-full flex-col items-center gap-1.5 text-center sm:gap-2">
        <p className="text-sm font-semibold leading-tight min-[420px]:text-base">{title}</p>
        <p className="text-xs leading-snug text-[var(--color-outer-space)]/70 min-[420px]:text-sm">{description}</p>
      </div>
      <button type="button" onClick={handlePrimary} className={shareButtonClasses}>
        {primaryLabelText}
      </button>
      {codeValue ? (
        <button
          type="button"
          onClick={handleCodeCopy}
          className={copyButtonClasses}
          aria-live="polite"
          title={codeCopied ? codeCopySuccessLabel : codeCopyLabel}
        >
          <span className="max-w-[70%] truncate font-mono tracking-wide min-[420px]:max-w-[75%]">
            {codeValue}
          </span>
          <span className="text-[var(--color-electric-purple)] transition group-hover:text-[var(--color-outer-space)]">
            {codeCopied ? codeCopySuccessLabel : codeCopyLabel}
          </span>
        </button>
      ) : null}
    </div>
  );
}
