import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogueDisplayItem } from '@/components/CatalogueGrid';
import { SimpleRedemptionFlow } from '../SimpleRedemptionFlow';

const itemRequiresVerification: CatalogueDisplayItem = {
  id: 'reward-simple',
  name: 'Simple Reward',
  description: null,
  priceAED: null,
  points: 500,
  link: null,
  imageUrl: null,
  status: null,
  requiresAgencyConfirmation: false,
  damacIslandCampaign: false,
  termsActive: false,
  termsText: null,
  termsVersion: null,
  termsUrl: null,
  termsSignature: null,
  requiresBuyerVerification: true,
  unitAllocations: [],
  category: 'reward',
};

describe('SimpleRedemptionFlow', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('forces buyer verification before showing redeem dialog', async () => {
    const user = userEvent.setup();
    render(
      <SimpleRedemptionFlow
        item={itemRequiresVerification}
        agentId="agent-1"
        agentCode="code-1"
        availablePoints={2000}
        minTopup={100}
        pointsPerAed={2}
        baseQuery=""
        termsAccepted
        onShowTerms={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: /buyer verification/i })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Customer first name/i), 'Alex');
    await user.type(screen.getByPlaceholderText('1234'), '1234');
    await user.click(screen.getByRole('button', { name: /confirm redeem/i }));

    await waitFor(() => expect(screen.getByText(/Redeem reward/i)).toBeInTheDocument());
  });
});
