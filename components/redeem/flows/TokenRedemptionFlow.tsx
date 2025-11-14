'use client';

import { useCallback, useMemo, useState } from 'react';
import type { CatalogueDisplayItem, CatalogueUnitAllocation } from '@/components/CatalogueGrid';
import { UnitAllocationDialog } from '../UnitAllocationDialog';
import { BuyerVerificationDialog } from '../BuyerVerificationDialog';
import { RedeemDialog } from '../RedeemDialog';

type BuyerDetails = { firstName: string; phoneLast4: string };

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
  const [buyerVerificationOpen, setBuyerVerificationOpen] = useState(false);
  const [buyerVerificationAllocation, setBuyerVerificationAllocation] = useState<CatalogueUnitAllocation | null>(null);
  const [preFilledBuyerDetails, setPreFilledBuyerDetails] = useState<BuyerDetails | null>(null);

  const allocations = useMemo(() => item.unitAllocations ?? [], [item.unitAllocations]);

  const resetFlow = useCallback(() => {
    setUnitAllocationSelection(null);
    setSelectedUnitAllocation(null);
    setShowUnitDialog(true);
    setRedeemStatus('idle');
    setRedeemMessage(null);
    setBuyerVerificationAllocation(null);
    setBuyerVerificationOpen(false);
    setPreFilledBuyerDetails(null);
    onClose();
  }, [onClose]);

  const beginRedeem = useCallback(
    (allocation: CatalogueUnitAllocation, buyerDetails?: BuyerDetails) => {
      const requiresBuyerVerification = !!allocation || item.requiresBuyerVerification === true;
      const details = buyerDetails ?? preFilledBuyerDetails;
      if (requiresBuyerVerification && !details) {
        setBuyerVerificationAllocation(allocation);
        setBuyerVerificationOpen(true);
        return;
      }

      if (buyerDetails) {
        setPreFilledBuyerDetails(buyerDetails);
      }

      setSelectedUnitAllocation(allocation);
      setRedeemStatus('idle');
      setRedeemMessage(null);
    },
    [item, preFilledBuyerDetails],
  );

  const confirmUnitAllocation = useCallback(() => {
    if (!unitAllocationSelection) return;
    const chosen = allocations.find((allocation) => allocation.id === unitAllocationSelection);
    if (!chosen) return;
    beginRedeem(chosen);
    setShowUnitDialog(false);
  }, [allocations, beginRedeem, unitAllocationSelection]);

  const handleBuyerVerificationSubmit = useCallback(
    (details: BuyerDetails) => {
      const allocation = buyerVerificationAllocation;
      if (!allocation) return;
      setBuyerVerificationOpen(false);
      beginRedeem(allocation, details);
    },
    [beginRedeem, buyerVerificationAllocation],
  );

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
    setBuyerVerificationOpen(false);
    setBuyerVerificationAllocation(null);
    resetFlow();
  }, [resetFlow]);

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
          preFilledDetails={preFilledBuyerDetails}
          onSubmit={handleRedeemSubmit}
          onClose={resetFlow}
        />
      ) : null}
    </>
  );
}
