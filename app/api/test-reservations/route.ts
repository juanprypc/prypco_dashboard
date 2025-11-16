import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabaseClient';

export const runtime = 'nodejs';

/**
 * Test endpoint to verify Supabase reservation system
 * GET /api/test-reservations
 */
export async function GET() {
  const supabase = getSupabaseAdminClient();
  const results: any[] = [];

  try {
    // Test 1: Count unit allocations
    results.push({ test: '1. Count unit allocations', status: 'running' });
    const { count, error: countError } = await supabase
      .from('unit_allocations' as never)
      .select('*', { count: 'exact', head: true });

    if (countError) {
      results[0].status = 'failed';
      results[0].error = countError.message;
      return NextResponse.json({ success: false, results }, { status: 500 });
    }

    results[0].status = 'passed';
    results[0].count = count;

    // Test 2: Fetch sample records
    results.push({ test: '2. Fetch sample records', status: 'running' });
    const { data: sampleData, error: fetchError } = await supabase
      .from('unit_allocations' as never)
      .select('id, unit_type, damac_island_code, released_status, reserved_by')
      .limit(3);

    if (fetchError) {
      results[1].status = 'failed';
      results[1].error = fetchError.message;
      return NextResponse.json({ success: false, results }, { status: 500 });
    }

    results[1].status = 'passed';
    results[1].sample = sampleData;

    // Test 3: Test create_reservation function
    const testUnit = (sampleData as any)?.[0];
    if (testUnit) {
      results.push({ test: '3. Test create_reservation', status: 'running', unitId: testUnit.id });

      const { data: createData, error: createError } = await supabase.rpc(
        'create_reservation' as never,
        {
          p_unit_id: testUnit.id,
          p_agent_id: `test_agent_${Date.now()}`,
          p_ler_code: 'LER_TEST',
          p_duration_minutes: 5,
        } as never
      );

      if (createError) {
        results[2].status = 'failed';
        results[2].error = createError.message;
      } else {
        const createResult = (createData as any)?.[0];
        results[2].status = createResult?.success ? 'passed' : 'failed';
        results[2].result = createResult;

        // Test 4: Test release_reservation if creation succeeded
        if (createResult?.success) {
          results.push({ test: '4. Test release_reservation', status: 'running', unitId: testUnit.id });

          const { data: releaseData, error: releaseError } = await supabase.rpc(
            'release_reservation' as never,
            {
              p_unit_id: testUnit.id,
              p_agent_id: `test_agent_${Date.now()}`,
            } as never
          );

          if (releaseError) {
            results[3].status = 'failed';
            results[3].error = releaseError.message;
          } else {
            results[3].status = 'passed';
            results[3].released = releaseData;
          }
        }
      }
    }

    // Test 5: Test expire_reservations
    results.push({ test: '5. Test expire_reservations', status: 'running' });
    const { data: expireData, error: expireError } = await supabase.rpc('expire_reservations' as never);

    if (expireError) {
      results[results.length - 1].status = 'failed';
      results[results.length - 1].error = expireError.message;
    } else {
      const expiredCount = (expireData as any)?.[0]?.expired_count ?? 0;
      results[results.length - 1].status = 'passed';
      results[results.length - 1].expiredCount = expiredCount;
    }

    // Summary
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      success: failed === 0,
      summary: {
        total: results.length,
        passed,
        failed,
      },
      results,
    });

  } catch (error) {
    console.error('Test error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message, results },
      { status: 500 }
    );
  }
}
