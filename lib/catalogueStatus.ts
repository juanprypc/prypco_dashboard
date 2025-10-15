import type { CatalogueProjectStatus } from './airtable';

type CatalogueStatusConfig = {
  label: string;
  badgeClass: string;
  helperText?: string;
  redeemDisabled: boolean;
};

const STATUS_CONFIG: Record<CatalogueProjectStatus, CatalogueStatusConfig> = {
  active: {
    label: 'Active',
    badgeClass:
      'bg-[#E6F7F0] text-[#107457] border border-[#B5E4CF]',
    redeemDisabled: false,
  },
  coming_soon: {
    label: 'Coming Soon',
    badgeClass:
      'bg-[#FFF4E5] text-[#B45309] border border-[#F5C78B]',
    helperText: 'This reward will be available soon. Check back shortly.',
    redeemDisabled: true,
  },
  last_units: {
    label: 'Last Units',
    badgeClass:
      'bg-[#F4E8FF] text-[var(--color-electric-purple)] border border-[#D5B7FF]',
    helperText: 'Limited availability. Redeem quickly to secure a slot.',
    redeemDisabled: false,
  },
  sold_out: {
    label: 'Sold Out',
    badgeClass:
      'bg-[#FEECEC] text-[#B91C1C] border border-[#F5B5B5]',
    helperText: 'Currently sold out. Reach out to the team for updates.',
    redeemDisabled: true,
  },
};

export function getCatalogueStatusConfig(status: CatalogueProjectStatus): CatalogueStatusConfig {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
}
