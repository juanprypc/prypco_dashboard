'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CatalogueDisplayItem, CatalogueUnitAllocation } from '@/components/CatalogueGrid';
import { UnitAllocationDialog } from '../UnitAllocationDialog';
import { BuyerVerificationDialog } from '../BuyerVerificationDialog';
import { RedeemDialog } from '../RedeemDialog';
import { useBuyerVerification } from '../hooks/useBuyerVerification';

type TokenRedemptionFlowProps = {
  item: CatalogueDisplayItem;
  agentId?: string | null;
  agentCode?: string | null;
  availablePoints: number;
  minTopup: number;
  pointsPerAed: number;
  baseQuery?: string;
  termsAccepted: boolean;
  onShowTerms: (item: CatalogueDisplayItem) => void;
  onClose: () => void;
};

export function TokenRedemptionFlow({
  item,
  agentId,
  agentCode,
  availablePoints,
  minTopup,
  pointsPerAed,
  baseQuery,
  termsAccepted,
  onShowTerms,
  onClose,
}: TokenRedemptionFlowProps) {
  const [unitAllocationSelection, setUnitAllocationSelection] = useState<string | null>(null);
  const [showUnitDialog, setShowUnitDialog] = useState(true);
  const [selectedUnitAllocation, setSelectedUnitAllocation] = useState<CatalogueUnitAllocation | null>(null);
  const [redeemStatus, setRedeemStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const {
    isOpen: buyerVerificationOpen,
    pendingSelection: buyerVerificationAllocation,
    prefilledDetails,
    ensureVerification,
    handleSubmit: handleBuyerVerificationSubmit,
    handleClose: closeBuyerVerificationDialog,
    reset: resetBuyerVerification,
  } = useBuyerVerification<CatalogueUnitAllocation>();

  const allocations = useMemo(() => item.unitAllocations ?? [], [item.unitAllocations]);

  const resetFlow = useCallback(() => {
    setUnitAllocationSelection(null);
    setSelectedUnitAllocation(null);
    setShowUnitDialog(true);
    setRedeemStatus('idle');
    setRedeemMessage(null);
    resetBuyerVerification();
    onClose();
  }, [onClose, resetBuyerVerification]);

  const showRedeemDialog = useCallback((allocation: CatalogueUnitAllocation | null) => {
    if (!allocation) return;
    setSelectedUnitAllocation(allocation);
    setRedeemStatus('idle');
    setRedeemMessage(null);
    setShowUnitDialog(false);
  }, []);

  const beginRedeem = useCallback(
    (allocation: CatalogueUnitAllocation) => {
      ensureVerification(allocation, item.requiresBuyerVerification === true, (verifiedAllocation) => {
        if (!verifiedAllocation) return;
        showRedeemDialog(verifiedAllocation);
      });
    },
    [ensureVerification, item.requiresBuyerVerification, showRedeemDialog],
  );

  const confirmUnitAllocation = useCallback(() => {
    if (!unitAllocationSelection) return;
    const chosen = allocations.find((allocation) => allocation.id === unitAllocationSelection);
    if (!chosen) return;
    beginRedeem(chosen);
  }, [allocations, beginRedeem, unitAllocationSelection]);

  const handleRedeemSubmit = useCallback(
    async ({ customerFirstName, customerPhoneLast4 }: { customerFirstName: string; customerPhoneLast4: string }) => {
      if (!selectedUnitAllocation) return;
      setRedeemStatus('submitting');
      setRedeemMessage(null);
      try {
        const rewardPoints =
          typeof selectedUnitAllocation.points === 'number'
            ? selectedUnitAllocation.points
            : typeof item.points === 'number'
              ? item.points
              : null;
        const res = await fetch('/api/redeem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            agentId: agentId ?? null,
            agentCode: agentCode ?? null,
            rewardId: item.id,
            rewardName: item.name,
            rewardPoints,
            priceAed: item.priceAED ?? null,
            unitAllocationId: selectedUnitAllocation.id,
            unitAllocationLabel: selectedUnitAllocation.unitType ?? null,
            unitAllocationPoints: typeof selectedUnitAllocation.points === 'number' ? selectedUnitAllocation.points : null,
            customerFirstName,
            customerPhoneLast4,
            requiresBuyerVerification: item.requiresBuyerVerification === true,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error((json as { error?: string })?.error || 'Redemption failed');
        }
        setRedeemStatus('success');
        setRedeemMessage('Thanks! We have received your request and will process it shortly.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Redemption failed';
        setRedeemStatus('error');
        setRedeemMessage(message);
      }
    },
    [agentCode, agentId, item, selectedUnitAllocation],
  );

  const handleBuyerVerificationClose = useCallback(() => {
    closeBuyerVerificationDialog();
    resetFlow();
  }, [closeBuyerVerificationDialog, resetFlow]);

  return (
    <>
      {showUnitDialog ? (
        <UnitAllocationDialog
          item={item}
          selectedId={unitAllocationSelection}
          onSelect={setUnitAllocationSelection}
          onConfirm={confirmUnitAllocation}
          onClose={resetFlow}
        />
      ) : null}

      {buyerVerificationOpen && buyerVerificationAllocation ? (
        <BuyerVerificationDialog
          item={item}
          unitAllocation={buyerVerificationAllocation}
          onSubmit={handleBuyerVerificationSubmit}
          onClose={handleBuyerVerificationClose}
        />
      ) : null}

      {selectedUnitAllocation ? (
        <RedeemDialog
          item={item}
          unitAllocation={selectedUnitAllocation}
          availablePoints={availablePoints}
          status={redeemStatus}
          message={redeemMessage}
          minAmount={minTopup}
          pointsPerAed={pointsPerAed}
          agentId={agentId}
          agentCode={agentCode}
          baseQuery={baseQuery}
          termsAccepted={termsAccepted}
          onShowTerms={onShowTerms}
          preFilledDetails={prefilledDetails}
          onSubmit={handleRedeemSubmit}
          onClose={resetFlow}
        />
      ) : null}
    </>
  );
}
