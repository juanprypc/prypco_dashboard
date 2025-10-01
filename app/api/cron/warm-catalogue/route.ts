import { fetchLoyaltyCatalogue } from '@/lib/airtable';
import { getKvClient } from '@/lib/kvClient';
import { CATALOGUE_CACHE_KEY, DEFAULT_CATALOGUE_TTL_SECONDS } from '@/lib/catalogueCache';

const kv = getKvClient();

export const runtime = 'edge';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const items = await fetchLoyaltyCatalogue();
    const payload = { items, fetchedAt: new Date().toISOString() };
    await kv.set(CATALOGUE_CACHE_KEY, payload, { ex: Math.max(DEFAULT_CATALOGUE_TTL_SECONDS, 60) });

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
