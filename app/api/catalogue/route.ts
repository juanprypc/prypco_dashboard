import { Sentry } from '@/lib/sentry';
import { fetchLoyaltyCatalogue } from '@/lib/airtable';
import { getKvClient } from '@/lib/kvClient';
import {
  CATALOGUE_CACHE_KEY,
  DEFAULT_CATALOGUE_TTL_SECONDS,
  catalogueCacheHasExpiringAsset,
  getSafeCatalogueCacheTtl,
  type CatalogueCachePayload,
} from '@/lib/catalogueCache';

const kv = getKvClient();

export const runtime = 'edge';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceFresh = searchParams.get('fresh') === '1';
    const ttlSeconds = getSafeCatalogueCacheTtl(DEFAULT_CATALOGUE_TTL_SECONDS);
    let bypassedStaleCache = false;

    if (!forceFresh) {
      const cached = await kv.get<CatalogueCachePayload>(CATALOGUE_CACHE_KEY);
      if (cached && !catalogueCacheHasExpiringAsset(cached)) {
        return new Response(JSON.stringify(cached), {
          headers: { 'content-type': 'application/json', 'x-cache': 'hit' },
        });
      }
      if (cached) bypassedStaleCache = true;
    }

    const items = await fetchLoyaltyCatalogue();
    const payload: CatalogueCachePayload = { items, fetchedAt: new Date().toISOString() };
    await kv.set(CATALOGUE_CACHE_KEY, payload, { ex: ttlSeconds });

    return new Response(JSON.stringify(payload), {
      headers: {
        'content-type': 'application/json',
        'x-cache': forceFresh || bypassedStaleCache ? 'refresh' : 'miss',
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
