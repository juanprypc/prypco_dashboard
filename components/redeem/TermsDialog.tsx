'use client';

import { useEffect, useRef, useState } from 'react';
import type { CatalogueDisplayItem } from '../CatalogueGrid';

type TermsDialogProps = {
  item: CatalogueDisplayItem;
  mode: 'view' | 'redeem';
  accepted: boolean;
  onAccept: (item: CatalogueDisplayItem) => void;
  onClose: () => void;
};

export function TermsDialog({ item, mode, accepted, onAccept, onClose }: TermsDialogProps) {
  const requireAcceptance = item.termsActive && !accepted;
  const requiresAgencyConfirmation = !!item.requiresAgencyConfirmation;
  const [checked, setChecked] = useState(accepted);
  const [agencyConfirmed, setAgencyConfirmed] = useState(() => accepted || !requiresAgencyConfirmation);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = `reward-terms-${item.id}`;

  useEffect(() => {
    setChecked(accepted);
  }, [accepted, item.id]);

  useEffect(() => {
    setAgencyConfirmed(accepted || !requiresAgencyConfirmation);
  }, [accepted, item.id, requiresAgencyConfirmation]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onClose]);

  useEffect(() => {
    if (requireAcceptance) {
      confirmRef.current?.focus();
    } else {
      closeRef.current?.focus();
    }
  }, [requireAcceptance]);

  const paragraphs = item.termsText
    ? item.termsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const requiresScroll = paragraphs.length > 0;
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(() => !requiresScroll);

  useEffect(() => {
    if (!requiresScroll) {
      setHasScrolledToEnd(true);
      return;
    }

    setHasScrolledToEnd(false);
    const element = contentRef.current;
    if (!element) return;

    const maybeMarkAsScrolled = () => {
      if (element.scrollHeight - element.scrollTop - element.clientHeight <= 8) {
        setHasScrolledToEnd(true);
      }
    };

    maybeMarkAsScrolled();
    element.addEventListener('scroll', maybeMarkAsScrolled);
    return () => element.removeEventListener('scroll', maybeMarkAsScrolled);
  }, [requiresScroll, item.id]);

  const handleAccept = () => {
    if (
      requireAcceptance &&
      (!checked || (requiresAgencyConfirmation && !agencyConfirmed) || (requiresScroll && !hasScrolledToEnd))
    ) {
      return;
    }
    onAccept(item);
  };

  const acceptDisabled =
    !requireAcceptance ||
    !checked ||
    (requiresAgencyConfirmation && !agencyConfirmed) ||
    (requiresScroll && !hasScrolledToEnd);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-[28px] border border-[#d1b7fb] bg-white px-4 pb-5 pt-4 text-[var(--color-outer-space)] shadow-xl sm:px-6 sm:py-6 max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 id={titleId} className="text-base font-semibold">
          Reward terms
        </h4>
        <p className="mt-1 text-xs leading-snug text-[var(--color-outer-space)]/70">
          Please review the reward terms before proceeding.
        </p>
        {item.termsUrl ? (
          <a
            href={item.termsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-electric-purple)] underline-offset-2 hover:underline"
          >
            Download terms (PDF)
          </a>
        ) : null}

        <div
          ref={contentRef}
          className="mt-3 max-h-60 overflow-auto rounded-[16px] bg-[var(--color-panel)]/60 px-3 py-3 text-xs leading-relaxed text-[var(--color-outer-space)]/80"
        >
          {paragraphs.length ? (
            paragraphs.map((paragraph, index) => (
              <p key={index} className="whitespace-pre-wrap">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-[var(--color-outer-space)]/60">No terms provided for this reward.</p>
          )}
        </div>

        {requireAcceptance ? (
          <div className="mt-3 space-y-2 text-xs text-[var(--color-outer-space)]/80">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border border-[var(--color-outer-space)]/40"
              />
              <span>I’ve read and accept the terms.</span>
            </label>
            {requiresAgencyConfirmation ? (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={agencyConfirmed}
                  onChange={(event) => setAgencyConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border border-[var(--color-outer-space)]/40"
                />
                <span>I confirm that my Agency is registered with DAMAC.</span>
              </label>
            ) : null}
            {requiresScroll && !hasScrolledToEnd ? (
              <p className="text-[11px] font-semibold text-[var(--color-electric-purple)]">
                Scroll to the end of the terms to enable acceptance.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-[var(--color-outer-space)]/60">You have already accepted these terms.</p>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-full border border-transparent px-4 py-2 text-xs font-semibold text-[var(--color-outer-space)]/70 transition hover:bg-[var(--color-panel)]/80"
          >
            {requireAcceptance && mode === 'redeem' ? 'Cancel' : 'Close'}
          </button>
          {requireAcceptance ? (
            <button
              ref={confirmRef}
              type="button"
              onClick={handleAccept}
              disabled={acceptDisabled}
              className="rounded-full border border-[var(--color-outer-space)] px-4 py-2 text-xs font-semibold text-[var(--color-outer-space)] transition hover:bg-[var(--color-panel)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === 'redeem' ? 'Accept & continue' : 'Accept terms'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
