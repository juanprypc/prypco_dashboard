import { Sentry } from '@/lib/sentry';
import { fetchLoyaltyCatalogueBase, fetchUnitAllocations } from '@/lib/airtable';
import { getKvClient } from '@/lib/kvClient';
import {
  CATALOGUE_CACHE_KEY,
  DEFAULT_CATALOGUE_TTL_SECONDS,
  catalogueCacheHasExpiringAsset,
  getSafeCatalogueCacheTtl,
  type CatalogueCachePayload,
} from '@/lib/catalogueCache';

const kv = getKvClient();

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const forceFresh = searchParams.get('fresh') === '1';
    const ttlSeconds = getSafeCatalogueCacheTtl(DEFAULT_CATALOGUE_TTL_SECONDS);
    let bypassedStaleCache = false;
    let catalogueBase;

    // Fetch catalogue structure from cache (or Airtable if miss)
    if (!forceFresh) {
      const cached = await kv.get<{ items: unknown[]; fetchedAt: string }>(CATALOGUE_CACHE_KEY);
      if (cached && !catalogueCacheHasExpiringAsset(cached)) {
        catalogueBase = cached.items;
      } else if (cached) {
        bypassedStaleCache = true;
      }
    }

    if (!catalogueBase) {
      catalogueBase = await fetchLoyaltyCatalogueBase();
      await kv.set(CATALOGUE_CACHE_KEY, { items: catalogueBase, fetchedAt: new Date().toISOString() }, { ex: ttlSeconds });
    }

    // ALWAYS fetch fresh unit allocations from Supabase (no caching for real-time data)
    const allocations = await fetchUnitAllocations();
    
    // Group allocations by catalogue ID
    const allocationsByCatalogue = new Map<string, typeof allocations>();
    for (const allocation of allocations) {
      if (!allocation.catalogueId) continue;
      const existing = allocationsByCatalogue.get(allocation.catalogueId);
      if (existing) existing.push(allocation);
      else allocationsByCatalogue.set(allocation.catalogueId, [allocation]);
    }

    // Merge catalogue with fresh allocations
    const items = (catalogueBase as Array<{ id: string }>).map((item) => ({
      ...item,
      unitAllocations: allocationsByCatalogue.get(item.id) ?? [],
    }));

    const payload: CatalogueCachePayload = { items, fetchedAt: new Date().toISOString() };

    return new Response(JSON.stringify(payload), {
      headers: {
        'content-type': 'application/json',
        'x-cache': forceFresh || bypassedStaleCache ? 'refresh' : 'partial',
        'x-allocations': 'fresh',
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
