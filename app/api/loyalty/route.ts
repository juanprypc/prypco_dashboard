import { Sentry } from '@/lib/sentry';
import { getKvClient } from '@/lib/kvClient';
import {
  extractAgentCodes,
  fetchAgentProfile,
  fetchLoyaltyForAgent,
  fetchPostedUnexpiredRecords,
  toPublicRow,
  type PublicLoyaltyRow,
} from '@/lib/airtable';

type CachedBody = {
  records: PublicLoyaltyRow[];
  displayName?: string | null;
  investorPromoCode?: string | null;
  investorWhatsappLink?: string | null;
};

const DEFAULT_TTL_SECONDS = Number(process.env.LOYALTY_CACHE_TTL ?? 60);

function cacheKeyFor(agentId?: string, agentCode?: string): string {
  return `loyalty:${agentId ?? ''}:${agentCode ?? ''}`;
}

const kv = getKvClient();

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawAgent = searchParams.get('agent')?.trim() || undefined;
  const agentCodeParam = searchParams.get('agentCode')?.trim() || undefined;

  const agentId = rawAgent && rawAgent.startsWith('rec') ? rawAgent : undefined;
  const agentCode = agentCodeParam || (!agentId ? rawAgent : undefined);
  const forceFresh = searchParams.get('fresh') === '1';

  if (!agentId && !agentCode) {
    return new Response(JSON.stringify({ error: 'missing agent or agentCode' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const debug = searchParams.get('debug') === '1';
    const skipExpiry = searchParams.get('skipExpiry') === '1';
    const ttlSeconds = Math.max(0, DEFAULT_TTL_SECONDS);
    const cacheEligible = !debug && !forceFresh && ttlSeconds > 0;
    const cacheKey = cacheEligible ? cacheKeyFor(agentId, agentCode) : null;

    if (cacheEligible && cacheKey) {
      const cached = await kv.get<CachedBody>(cacheKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: { 'content-type': 'application/json', 'x-cache': 'hit' },
        });
      }
    }
    // Try to fetch the agent's display name for text fallback rows if configured
    const agentProfile = agentId ? await fetchAgentProfile(agentId).catch(() => null) : null;
    const inferredName = agentProfile?.displayName ?? null;
    const rows = await fetchLoyaltyForAgent({
      agentId,
      agentCode,
      agentName: inferredName || undefined,
    });
    let displayName = inferredName;
    let investorPromoCode = agentProfile?.investorPromoCode ?? null;
    let investorWhatsappLink = agentProfile?.investorWhatsappLink ?? null;
    if (!displayName) {
      const firstWithAgent = rows.find((row) => {
        const value = row.fields?.agent as unknown;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.trim().startsWith('rec');
        return false;
      });
      if (firstWithAgent) {
        const raw = firstWithAgent.fields?.agent as string[] | string | undefined;
        let candidate: string | undefined;
        if (Array.isArray(raw)) candidate = raw[0];
        else if (typeof raw === 'string') candidate = raw;
        if (candidate?.startsWith('rec')) {
          const fallbackProfile = await fetchAgentProfile(candidate).catch(() => null);
          displayName = fallbackProfile?.displayName ?? displayName;
          investorPromoCode = investorPromoCode ?? fallbackProfile?.investorPromoCode ?? null;
          investorWhatsappLink = investorWhatsappLink ?? fallbackProfile?.investorWhatsappLink ?? null;
        }
      }
    }
    const records = rows
      .map(toPublicRow)
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (debug) {
      const all = await fetchPostedUnexpiredRecords(skipExpiry);
      const allPub = all.map(toPublicRow).filter((x): x is NonNullable<typeof x> => Boolean(x));
      const byId = agentId
        ? all.filter((r) => Array.isArray(r.fields?.agent) && (r.fields!.agent as string[]).includes(agentId))
        : [];
      const byName = inferredName
        ? all.filter((r) => {
            const a = r.fields?.agent as unknown;
            if (Array.isArray(a)) return a.includes(inferredName);
            if (typeof a === 'string') return a.trim() === inferredName;
            return false;
          })
        : [];
      const byCode = agentCode
        ? all.filter((r) => {
            const codes = extractAgentCodes((r.fields || {}) as Record<string, unknown>);
            return codes.some((code) => code === agentCode || code.toLowerCase() === agentCode.toLowerCase());
          })
        : [];
      const ids = {
        all: all.map((r) => r.id),
        byId: byId.map((r) => r.id),
        byName: byName.map((r) => r.id),
        byCode: byCode.map((r) => r.id),
        returned: records.map((r) => r.id),
      };
      const body: {
        records: PublicLoyaltyRow[];
        debug: {
          counts: { all: number; allPub: number; byId: number; byName: number; byCode: number };
          ids: { all: string[]; byId: string[]; byName: string[]; byCode: string[]; returned: string[] };
        };
        all?: PublicLoyaltyRow[];
        displayName?: string | null;
        investorPromoCode?: string | null;
        investorWhatsappLink?: string | null;
      } = {
        records,
        debug: {
          counts: { all: all.length, allPub: allPub.length, byId: byId.length, byName: byName.length, byCode: byCode.length },
          ids,
        },
        displayName,
        investorPromoCode,
        investorWhatsappLink,
      };
      if (process.env.NODE_ENV !== 'production') body.all = allPub;
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }

    const body: CachedBody = { records, displayName, investorPromoCode, investorWhatsappLink };

    if (cacheEligible && cacheKey) {
      await kv.set(cacheKey, body, { ex: ttlSeconds });
    }

    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json', 'x-cache': 'miss' },
    });
  } catch (err) {
    Sentry.captureException(err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
