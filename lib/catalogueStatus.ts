import type { CatalogueProjectStatus } from './airtable';

export type CatalogueStatusConfig = {
  label: string;
  badgeClass: string;
  redeemDisabled: boolean;
  hidden?: boolean;
};

const STATUS_CONFIG: Record<CatalogueProjectStatus, CatalogueStatusConfig> = {
  active: {
    label: 'Active',
    badgeClass: 'border border-[var(--color-outer-space)]/20 text-[var(--color-outer-space)] bg-white',
    redeemDisabled: false,
    hidden: true,
  },
  coming_soon: {
    label: 'Coming Soon',
    badgeClass: 'border border-[var(--color-sunrise)]/80 bg-[var(--color-sunrise)] text-[var(--color-outer-space)]',
    redeemDisabled: true,
  },
  last_units: {
    label: 'Last Units',
    badgeClass: 'border border-[var(--color-electric-purple)] text-[var(--color-electric-purple)] bg-white',
    redeemDisabled: false,
  },
  sold_out: {
    label: 'Sold Out',
    badgeClass: 'border border-[var(--color-rose)] bg-[var(--color-rose)] text-white',
    redeemDisabled: true,
  },
};

export function getCatalogueStatusConfig(status: CatalogueProjectStatus): CatalogueStatusConfig {
  return STATUS_CONFIG[status];
}
