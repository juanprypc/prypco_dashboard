import { NextRequest, NextResponse } from 'next/server';
import type { CatalogueUnitAllocation } from '@/lib/airtable';

type AllocationWithAvailability = {
  id: string;
  points: number | null;
  unitType: string | null;
  priceAed: number | null;
  availability: 'available' | 'booked';
  damacIslandcode: string | null;
  brType: string | null;
};

async function fetchUnitAllocationsInternal(): Promise<CatalogueUnitAllocation[]> {
  const {fetchLoyaltyCatalogue} = await import('@/lib/airtable');
  const catalogues = await fetchLoyaltyCatalogue();
  const allAllocations: CatalogueUnitAllocation[] = [];
  for (const catalogue of catalogues) {
    allAllocations.push(...catalogue.unitAllocations);
  }
  return allAllocations;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const catalogueId = searchParams.get('catalogueId');

    const allocations = await fetchUnitAllocationsInternal();

    let filtered = allocations;
    if (catalogueId) {
      filtered = allocations.filter((a) => a.catalogueId === catalogueId);
    }

    const response: AllocationWithAvailability[] = filtered.map((allocation) => {
      const isAvailable = allocation.remainingStock !== null && allocation.remainingStock > 0;
      return {
        id: allocation.id,
        points: allocation.points,
        unitType: allocation.unitType,
        priceAed: allocation.priceAed ?? null,
        availability: isAvailable ? 'available' : 'booked',
        damacIslandcode: allocation.damacIslandcode,
        brType: allocation.brType,
      };
    });

    return NextResponse.json(
      { allocations: response },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('DAMAC map API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch allocations', allocations: [] },
      { status: 500 }
    );
  }
}
