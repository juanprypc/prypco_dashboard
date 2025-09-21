import { fetchLoyaltyCatalogue } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = await fetchLoyaltyCatalogue();
    return new Response(
      JSON.stringify({
        items,
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

