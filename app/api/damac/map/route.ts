import { NextRequest, NextResponse } from 'next/server';
import { fetchUnitAllocations } from '@/lib/airtable';

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
  cluster: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const catalogueId = searchParams.get('catalogueId');

    // Fetch fresh allocations directly from Supabase (no caching)
    const allocations = await fetchUnitAllocations(false);  // Get ALL units for map
    const now = Date.now();

    let filtered = allocations;
    if (catalogueId) {
      filtered = allocations.filter((a) => a.catalogueId === catalogueId);
    }

    const response: AllocationWithAvailability[] = filtered.map((allocation) => {
      const remainingStock = typeof allocation.remainingStock === 'number' ? allocation.remainingStock : 0;
      const reservationExpiresAt = allocation.reservationExpiresAt ? Date.parse(allocation.reservationExpiresAt) : null;
      const reservationActive =
        Boolean(allocation.reservedBy) &&
        (reservationExpiresAt === null || (Number.isFinite(reservationExpiresAt) && reservationExpiresAt > now));
      const isAvailable = remainingStock > 0 && !reservationActive;
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
      cluster: (allocation as { cluster?: string | null }).cluster ?? null,
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
