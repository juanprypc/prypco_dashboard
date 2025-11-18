import { NextResponse } from 'next/server';
import { fetchAllUnitsForAdmin } from '@/lib/damacAdmin';

// TODO: Add authentication middleware
// For now, this should be protected by your auth system

export async function GET() {
  try {
    // Fetch ALL units (including sold/unavailable)
    const allUnits = await fetchAllUnitsForAdmin();

    return NextResponse.json({ units: allUnits });
  } catch (error) {
    console.error('Error fetching admin units:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch units';
    return NextResponse.json({ error: message, units: [] }, { status: 500 });
  }
}
