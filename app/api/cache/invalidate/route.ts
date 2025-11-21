import { NextRequest, NextResponse } from 'next/server';
import { getKvClient } from '@/lib/kvClient';

const CACHE_VERSION = 'v2';

function cacheKeyFor(agentId?: string | null, agentCode?: string | null) {
  return `loyalty:${CACHE_VERSION}:${agentId ?? ''}:${agentCode ?? ''}`;
}

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const expected = process.env.CACHE_INVALIDATE_SECRET;

  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as { agentId?: string | null; agentCode?: string | null } | null;
  const agentId = body?.agentId?.trim() || null;
  const agentCode = body?.agentCode?.trim() || null;

  if (!agentId && !agentCode) {
    return NextResponse.json({ error: 'Missing agent identifiers' }, { status: 400 });
  }

  const kv = getKvClient();
  const keys = new Set<string>();
  keys.add(cacheKeyFor(agentId, agentCode));
  // also clear variants in case one identifier is missing in cache key usage
  keys.add(cacheKeyFor(agentId, null));
  keys.add(cacheKeyFor(null, agentCode));

  try {
    await Promise.all(Array.from(keys).map((key) => kv.del(key)));
    return NextResponse.json({ ok: true, cleared: Array.from(keys) });
  } catch (_err) {
    return NextResponse.json({ error: 'Failed to invalidate cache' }, { status: 500 });
  }
}
