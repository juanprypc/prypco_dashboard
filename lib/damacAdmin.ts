import type { CatalogueUnitAllocation } from './airtable';
import { fetchUnitAllocationsFromAirtable } from './airtable';

/**
 * Fetch all DAMAC units for admin panel, including sold/unavailable ones
 * This bypasses the normal filtering logic
 */
export async function fetchAllUnitsForAdmin(): Promise<CatalogueUnitAllocation[]> {
  // Fetch ALL units (including sold/unavailable)
  return await fetchUnitAllocationsFromAirtable(false);
}

/**
 * Normalize LER reference format
 * Converts various formats to standard LER-XXXX format
 *
 * Examples:
 * - "LER-1234" -> "LER-1234"
 * - "1234" -> "LER-1234"
 * - "ler1234" -> "LER-1234"
 * - "LER 1234" -> "LER-1234"
 */
export function normalizeLer(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  // Remove 'LER-' or 'LER ' prefix if present
  const withoutPrefix = trimmed.startsWith('LER-')
    ? trimmed.slice(4)
    : trimmed.startsWith('LER')
    ? trimmed.slice(3)
    : trimmed;
  // Extract only digits
  const digitsOnly = withoutPrefix.replace(/\D/g, '');
  // Require at least 4 digits
  if (digitsOnly.length < 4) return null;
  return `LER-${digitsOnly}`;
}
