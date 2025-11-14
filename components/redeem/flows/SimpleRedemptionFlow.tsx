'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CatalogueDisplayItem } from '@/components/CatalogueGrid';
import { BuyerVerificationDialog } from '../BuyerVerificationDialog';
import { RedeemDialog } from '../RedeemDialog';

type BuyerDetails = { firstName: string; phoneLast4: string };

type SimpleRedemptionFlowProps = {
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

export function SimpleRedemptionFlow({
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
}: SimpleRedemptionFlowProps) {
  const [redeemStatus, setRedeemStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const [buyerVerificationOpen, setBuyerVerificationOpen] = useState(false);
  const [preFilledBuyerDetails, setPreFilledBuyerDetails] = useState<BuyerDetails | null>(null);
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false);

  const resetFlow = useCallback(() => {
    setRedeemStatus('idle');
    setRedeemMessage(null);
    setBuyerVerificationOpen(false);
    setPreFilledBuyerDetails(null);
    setRedeemDialogOpen(false);
    onClose();
  }, [onClose]);

  const beginRedeem = useCallback(
    (buyerDetails?: BuyerDetails) => {
      const requiresBuyerVerification = item.requiresBuyerVerification === true;
      const details = buyerDetails ?? preFilledBuyerDetails;
      if (requiresBuyerVerification && !details) {
        setBuyerVerificationOpen(true);
        return;
      }

      if (buyerDetails) {
        setPreFilledBuyerDetails(buyerDetails);
      }

      setRedeemStatus('idle');
      setRedeemMessage(null);
      setRedeemDialogOpen(true);
    },
    [item, preFilledBuyerDetails],
  );

  useEffect(() => {
    beginRedeem();
  }, [beginRedeem]);

  const handleBuyerVerificationSubmit = useCallback(
    (details: BuyerDetails) => {
      setBuyerVerificationOpen(false);
      beginRedeem(details);
    },
    [beginRedeem],
  );

  const handleRedeemSubmit = useCallback(
    async ({ customerFirstName, customerPhoneLast4 }: { customerFirstName: string; customerPhoneLast4: string }) => {
      setRedeemStatus('submitting');
      setRedeemMessage(null);
      try {
        const rewardPoints = typeof item.points === 'number' ? item.points : null;
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
            unitAllocationId: null,
            unitAllocationLabel: null,
            unitAllocationPoints: null,
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
    [agentCode, agentId, item],
  );

  const handleBuyerVerificationClose = useCallback(() => {
    setBuyerVerificationOpen(false);
    resetFlow();
  }, [resetFlow]);

  return (
    <>
      {buyerVerificationOpen ? (
        <BuyerVerificationDialog item={item} unitAllocation={null} onSubmit={handleBuyerVerificationSubmit} onClose={handleBuyerVerificationClose} />
      ) : null}

      {redeemDialogOpen ? (
        <RedeemDialog
          item={item}
          availablePoints={availablePoints}
          status={redeemStatus}
          message={redeemMessage}
          minAmount={minTopup}
          pointsPerAed={pointsPerAed}
          agentId={agentId}
          agentCode={agentCode}
          baseQuery={baseQuery}
          onSubmit={handleRedeemSubmit}
          onClose={resetFlow}
          onShowTerms={onShowTerms}
          termsAccepted={termsAccepted}
          preFilledDetails={preFilledBuyerDetails}
        />
      ) : null}
    </>
  );
}
