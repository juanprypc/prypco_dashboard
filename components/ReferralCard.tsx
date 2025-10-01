'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type ShareOption = {
  key: string;
  label: string;
  successLabel?: string;
  onSelect?: () => Promise<void> | void;
  disabled?: boolean;
};

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
  options?: ShareOption[];
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
  options,
}: Props) {
  const [primaryCopied, setPrimaryCopied] = useState(false);
  const [secondaryCopied, setSecondaryCopied] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionFeedback, setOptionFeedback] = useState<Record<string, boolean>>({});

  const hasOptions = Array.isArray(options) && options.length > 0;
  const showSecondary = Boolean(secondaryLabel) && !hasOptions;

  const baseButtonClasses =
    'inline-flex w-full min-h-[34px] items-center justify-center rounded-full px-3 py-2 text-xs font-semibold transition min-[420px]:w-auto min-[420px]:px-3.5 min-[420px]:py-2.5 min-[420px]:text-sm';
  const primaryButtonClasses = `${baseButtonClasses} border border-[var(--color-outer-space)] text-[var(--color-outer-space)] hover:bg-[var(--color-panel)]`;
  const secondaryButtonClasses = `${baseButtonClasses} border border-transparent bg-[var(--color-panel)] text-[var(--color-outer-space)] hover:border-[var(--color-outer-space)]/20 hover:bg-[rgba(246,243,248,0.85)]`;

  const cardClass = className ? `${REFERRAL_CARD_BASE_CLASS} ${className}` : REFERRAL_CARD_BASE_CLASS;

  useEffect(() => {
    if (!hasOptions) {
      setOptionsOpen(false);
      setOptionFeedback({});
    }
  }, [hasOptions]);

  const handlePrimary = useCallback(async () => {
    if (hasOptions) {
      setOptionsOpen((open) => !open);
      return;
    }
    if (!onPrimaryClick) return;
    await onPrimaryClick();
    if (!primarySuccessLabel) return;
    setPrimaryCopied(true);
    setTimeout(() => setPrimaryCopied(false), 1500);
  }, [hasOptions, onPrimaryClick, primarySuccessLabel]);

  const handleSecondary = useCallback(async () => {
    if (!onSecondaryClick) return;
    await onSecondaryClick();
    if (!secondarySuccessLabel) return;
    setSecondaryCopied(true);
    setTimeout(() => setSecondaryCopied(false), 1500);
  }, [onSecondaryClick, secondarySuccessLabel]);

  const handleOptionSelect = useCallback(async (option: ShareOption) => {
    if (option.disabled) return;
    try {
      await option.onSelect?.();
      if (option.successLabel) {
        setOptionFeedback((prev) => ({ ...prev, [option.key]: true }));
        setTimeout(() => {
          setOptionFeedback((prev) => ({ ...prev, [option.key]: false }));
        }, 1500);
      } else {
        setOptionsOpen(false);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const primaryButtonLabel = useMemo(() => {
    if (hasOptions) {
      return optionsOpen ? 'Hide options' : primaryLabel;
    }
    return primaryCopied ? primarySuccessLabel : primaryLabel;
  }, [hasOptions, optionsOpen, primaryLabel, primaryCopied, primarySuccessLabel]);

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
          hasOptions
            ? 'items-center'
            : showSecondary
            ? 'min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-center min-[420px]:gap-3'
            : 'min-[420px]:flex-row min-[420px]:justify-center'
        }`}
      >
        <button
          type="button"
          onClick={handlePrimary}
          className={primaryButtonClasses}
          aria-expanded={hasOptions ? optionsOpen : undefined}
        >
          {primaryButtonLabel}
        </button>
        {!hasOptions && secondaryLabel ? (
          <button type="button" onClick={handleSecondary} className={secondaryButtonClasses}>
            {secondaryCopied ? secondarySuccessLabel : secondaryLabel}
          </button>
        ) : null}
      </div>
      {hasOptions && optionsOpen ? (
        <div className="w-full rounded-[20px] border border-[#d1b7fb]/70 bg-white/95 px-3 py-3 shadow-[0_18px_45px_-40px_rgba(13,9,59,0.35)]">
          <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-center min-[420px]:gap-3">
            {options?.map((option) => {
              const activeLabel = optionFeedback[option.key]
                ? option.successLabel ?? option.label
                : option.label;
              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => handleOptionSelect(option)}
                  className={`${secondaryButtonClasses} ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {activeLabel}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
