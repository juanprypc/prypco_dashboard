'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CatalogueDisplayItem } from '@/components/CatalogueGrid';
import { TermsDialog } from '../TermsDialog';

type TermsMode = 'view' | 'redeem';

type RedemptionContextValue = {
  hasAcceptedTerms: (item: CatalogueDisplayItem | null) => boolean;
  showTermsDialog: (item: CatalogueDisplayItem) => void;
  requireTermsAcceptance: (item: CatalogueDisplayItem, onAccepted: () => void) => void;
};

const RedemptionContext = createContext<RedemptionContextValue | undefined>(undefined);

export function RedemptionProvider({ children }: { children: ReactNode }) {
  const [termsDialogItem, setTermsDialogItem] = useState<CatalogueDisplayItem | null>(null);
  const [termsDialogMode, setTermsDialogMode] = useState<TermsMode>('view');
  const [acceptedItems, setAcceptedItems] = useState<Set<string>>(() => new Set());
  const pendingActionRef = useRef<(() => void) | null>(null);

  const hasAcceptedTerms = useCallback(
    (item: CatalogueDisplayItem | null) => {
      if (!item || !item.termsActive) return true;
      return acceptedItems.has(item.id);
    },
    [acceptedItems],
  );

  const markAccepted = useCallback((itemId: string) => {
    setAcceptedItems((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  const closeDialog = useCallback(() => {
    setTermsDialogItem(null);
    pendingActionRef.current = null;
  }, []);

  const handleAccept = useCallback(() => {
    if (!termsDialogItem) return;
    markAccepted(termsDialogItem.id);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setTermsDialogItem(null);
    action?.();
  }, [markAccepted, termsDialogItem]);

  const openDialog = useCallback((item: CatalogueDisplayItem, mode: TermsMode, onAccepted?: () => void) => {
    setTermsDialogItem(item);
    setTermsDialogMode(mode);
    pendingActionRef.current = onAccepted ?? null;
  }, []);

  const showTermsDialog = useCallback(
    (item: CatalogueDisplayItem) => {
      openDialog(item, 'view');
    },
    [openDialog],
  );

  const requireTermsAcceptance = useCallback(
    (item: CatalogueDisplayItem, onAccepted: () => void) => {
      openDialog(item, 'redeem', onAccepted);
    },
    [openDialog],
  );

  const value = useMemo<RedemptionContextValue>(
    () => ({
      hasAcceptedTerms,
      showTermsDialog,
      requireTermsAcceptance,
    }),
    [hasAcceptedTerms, showTermsDialog, requireTermsAcceptance],
  );

  return (
    <RedemptionContext.Provider value={value}>
      {children}
      {termsDialogItem ? (
        <TermsDialog
          item={termsDialogItem}
          mode={termsDialogMode}
          accepted={hasAcceptedTerms(termsDialogItem)}
          onAccept={handleAccept}
          onClose={closeDialog}
        />
      ) : null}
    </RedemptionContext.Provider>
  );
}

export function useRedemptionContext(): RedemptionContextValue {
  const context = useContext(RedemptionContext);
  if (!context) {
    throw new Error('useRedemptionContext must be used within a RedemptionProvider');
  }
  return context;
}
