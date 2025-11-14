'use client';

import { useCallback, useState, useRef } from 'react';

export type BuyerDetails = { firstName: string; phoneLast4: string };

type VerificationCallback<TSelection> = (selection: TSelection | null, details?: BuyerDetails) => void;

export function useBuyerVerification<TSelection>() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<TSelection | null>(null);
  const [prefilledDetails, setPrefilledDetails] = useState<BuyerDetails | null>(null);
  const pendingCallbackRef = useRef<VerificationCallback<TSelection> | null>(null);

  const ensureVerification = useCallback(
    (selection: TSelection | null, requiresVerification: boolean, proceed: VerificationCallback<TSelection>) => {
      if (!requiresVerification) {
        proceed(selection, prefilledDetails ?? undefined);
        return;
      }
      if (prefilledDetails) {
        proceed(selection, prefilledDetails);
        return;
      }

      setPendingSelection(selection);
      pendingCallbackRef.current = proceed;
      setIsOpen(true);
    },
    [prefilledDetails],
  );

  const handleSubmit = useCallback(
    (details: BuyerDetails) => {
      setPrefilledDetails(details);
      setIsOpen(false);
      const callback = pendingCallbackRef.current;
      pendingCallbackRef.current = null;
      const selection = pendingSelection;
      setPendingSelection(null);
      callback?.(selection, details);
    },
    [pendingSelection],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setPendingSelection(null);
    pendingCallbackRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setIsOpen(false);
    setPendingSelection(null);
    setPrefilledDetails(null);
    pendingCallbackRef.current = null;
  }, []);

  return {
    isOpen,
    pendingSelection,
    prefilledDetails,
    ensureVerification,
    handleSubmit,
    handleClose,
    reset,
  };
}
