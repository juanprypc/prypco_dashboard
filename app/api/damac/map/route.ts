import { NextRequest, NextResponse } from 'next/server';
import { fetchUnitAllocations } from '@/lib/airtable';
import type { CatalogueUnitAllocation } from '@/lib/airtable';

type AllocationWithAvailability = {
  id: string;
  points: number | null;
  unitType: string | null;
  priceAed: number | null;
  propertyPrice: number | null;
  plotAreaSqft: number | null;
  saleableAreaSqft: number | null;
  availability: 'available' | 'booked';
  damacIslandcode: string | null;
  brType: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const catalogueId = searchParams.get('catalogueId');

    // Fetch fresh allocations directly from Supabase (no caching)
    const allocations = await fetchUnitAllocations();

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
        propertyPrice: allocation.propertyPrice ?? null,
        plotAreaSqft: allocation.plotAreaSqft ?? null,
        saleableAreaSqft: allocation.saleableAreaSqft ?? null,
        availability: isAvailable ? 'available' : 'booked',
        damacIslandcode: allocation.damacIslandcode,
        brType: allocation.brType,
      };
    });

    return NextResponse.json(
      { allocations: response },
      {
        headers: {
          // NO caching - always fetch fresh from Supabase
          'Cache-Control': 'no-store, must-revalidate',
          'x-data-source': 'supabase-realtime',
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
