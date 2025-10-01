import { Sentry } from '@/lib/sentry';
import { fetchLoyaltyCatalogue } from '@/lib/airtable';
import { getKvClient } from '@/lib/kvClient';
import { CATALOGUE_CACHE_KEY, DEFAULT_CATALOGUE_TTL_SECONDS } from '@/lib/catalogueCache';

const kv = getKvClient();

export const runtime = 'edge';

type CatalogueCache = {
  items: Awaited<ReturnType<typeof fetchLoyaltyCatalogue>>;
  fetchedAt: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceFresh = searchParams.get('fresh') === '1';
    const ttlSeconds = Math.max(DEFAULT_CATALOGUE_TTL_SECONDS, 60);

    if (!forceFresh) {
      const cached = await kv.get<CatalogueCache>(CATALOGUE_CACHE_KEY);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { 'content-type': 'application/json', 'x-cache': 'hit' },
        });
      }
    }

    const items = await fetchLoyaltyCatalogue();
    const payload: CatalogueCache = { items, fetchedAt: new Date().toISOString() };
    await kv.set(CATALOGUE_CACHE_KEY, payload, { ex: ttlSeconds });

    return new Response(JSON.stringify(payload), {
      headers: {
        'content-type': 'application/json',
        'x-cache': forceFresh ? 'refresh' : 'miss',
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
