import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import type { CatalogueDisplayItem } from '@/components/CatalogueGrid';
import { RedemptionProvider, useRedemptionContext } from '../RedemptionContext';

const mockItem: CatalogueDisplayItem = {
  id: 'reward-1',
  name: 'Sample Reward',
  description: null,
  priceAED: null,
  points: 1000,
  link: null,
  imageUrl: null,
  status: null,
  requiresAgencyConfirmation: false,
  damacIslandCampaign: false,
  termsActive: true,
  termsText: 'Line',
  termsVersion: null,
  termsUrl: null,
  termsSignature: null,
  requiresBuyerVerification: false,
  unitAllocations: [],
  category: 'reward',
};

function Consumer() {
  const { hasAcceptedTerms, requireTermsAcceptance, showTermsDialog } = useRedemptionContext();
  const [continued, setContinued] = useState(false);

  return (
    <div>
      <p data-testid="terms-status">{hasAcceptedTerms(mockItem) ? 'accepted' : 'pending'}</p>
      <p data-testid="continue-status">{continued ? 'continued' : 'waiting'}</p>
      <button type="button" onClick={() => requireTermsAcceptance(mockItem, () => setContinued(true))}>
        Require terms
      </button>
      <button type="button" onClick={() => showTermsDialog(mockItem)}>
        View terms
      </button>
    </div>
  );
}

describe('RedemptionProvider', () => {
  test('prompts for acceptance and records approval', () => {
    render(
      <RedemptionProvider>
        <Consumer />
      </RedemptionProvider>,
    );

    expect(screen.getByTestId('terms-status')).toHaveTextContent('pending');
    fireEvent.click(screen.getByRole('button', { name: /require terms/i }));

    // Terms dialog should appear
    expect(screen.getByRole('dialog', { name: /reward terms/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /accept the terms/i }));
    fireEvent.click(screen.getByRole('button', { name: /accept & continue/i }));

    expect(screen.queryByText(/reward terms/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('terms-status')).toHaveTextContent('accepted');
    expect(screen.getByTestId('continue-status')).toHaveTextContent('continued');
  });
});
