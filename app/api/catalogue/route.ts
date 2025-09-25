import { Sentry } from '@/lib/sentry';
import { fetchLoyaltyCatalogue } from '@/lib/airtable';

export const runtime = 'edge';
export const revalidate = 86400; // cache catalogue for 1 day

export async function GET() {
  try {
    const items = await fetchLoyaltyCatalogue();
    return new Response(
      JSON.stringify({
        items,
        fetchedAt: new Date().toISOString(),
      }),
      {
        headers: {
          'content-type': 'application/json',
          'cache-control': 's-maxage=86400, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
