import { fetchLoyaltyCatalogue } from '@/lib/airtable';
import { getKvClient } from '@/lib/kvClient';
import {
  CATALOGUE_CACHE_KEY,
  DEFAULT_CATALOGUE_TTL_SECONDS,
  getSafeCatalogueCacheTtl,
  type CatalogueCachePayload,
} from '@/lib/catalogueCache';

const kv = getKvClient();

export const runtime = 'edge';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const vercelSignature = request.headers.get('x-vercel-cron-signature');
  if (secret && !vercelSignature) {
    const authHeader = request.headers.get('authorization') || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const urlToken = new URL(request.url).searchParams.get('token') || undefined;
    if (headerToken !== secret && urlToken !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const items = await fetchLoyaltyCatalogue();
    const payload: CatalogueCachePayload = { items, fetchedAt: new Date().toISOString() };
    await kv.set(CATALOGUE_CACHE_KEY, payload, { ex: getSafeCatalogueCacheTtl(DEFAULT_CATALOGUE_TTL_SECONDS) });

    return new Response(JSON.stringify({ ok: true, count: items.length, refreshedAt: payload.fetchedAt }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
