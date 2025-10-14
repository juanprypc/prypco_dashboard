const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const pointsFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const compactAedFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'AED',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatNumber(value: number | string): string {
  if (typeof value === 'string') return value;
  return numberFormatter.format(value);
}

export function formatPoints(value: number): string {
  return pointsFormatter.format(value);
}

export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatAedCompact(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return compactAedFormatter.format(value);
}
