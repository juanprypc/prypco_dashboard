import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogueDisplayItem, CatalogueUnitAllocation } from '@/components/CatalogueGrid';
import { TokenRedemptionFlow } from '../TokenRedemptionFlow';

const allocation: CatalogueUnitAllocation = {
  id: 'alloc-1',
  unitType: 'Villa',
  maxStock: 1,
  points: 1500,
  pictureUrl: null,
  priceAed: 1000000,
};

const tokenItem: CatalogueDisplayItem = {
  id: 'token-1',
  name: 'Token Reward',
  description: null,
  priceAED: null,
  points: null,
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
  unitAllocations: [allocation],
  category: 'token',
};

describe('TokenRedemptionFlow', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('walks through allocation selection and buyer verification', async () => {
    const user = userEvent.setup();
    render(
      <TokenRedemptionFlow
        item={tokenItem}
        agentId="agent-1"
        agentCode="code-1"
        availablePoints={5000}
        minTopup={100}
        pointsPerAed={2}
        baseQuery=""
        termsAccepted
        onShowTerms={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: /choose property type/i });
    await user.click(within(dialog).getByRole('button', { name: /villa/i }));
    await user.click(within(dialog).getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('heading', { name: /buyer verification/i })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Customer first name/i), 'Sara');
    await user.type(screen.getByPlaceholderText('1234'), '8888');
    await user.click(screen.getByRole('button', { name: /confirm redeem/i }));

    await waitFor(() => expect(screen.getByText(/Redeem reward/i)).toBeInTheDocument());
  });
});
