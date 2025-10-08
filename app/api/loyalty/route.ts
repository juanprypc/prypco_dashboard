import { Sentry } from '@/lib/sentry';
import { getKvClient } from '@/lib/kvClient';
import type { PublicLoyaltyRow } from '@/lib/airtable';
import {
  fetchAgentProfileByCode as fetchSupabaseAgentProfileByCode,
  fetchAgentProfileById as fetchSupabaseAgentProfileById,
  fetchAllPostedLoyaltyPointsRaw,
  fetchLoyaltyPointRows,
  fetchMonthlySummaries,
  mapLoyaltyPointsToPublic,
  type SupabaseAgentProfile,
  type LoyaltyMonthlySummary,
} from '@/lib/supabaseLoyalty';

type LoyaltyTotals = {
  totalPoints: number;
  positivePoints: number;
  negativePoints: number;
  currentMonth: number;
  expiringSoon: number;
};

type CachedBody = {
  records: PublicLoyaltyRow[];
  displayName?: string | null;
  investorPromoCode?: string | null;
  investorWhatsappLink?: string | null;
  agentReferralLink?: string | null;
  agentReferralWhatsappLink?: string | null;
  monthlySummary?: LoyaltyMonthlySummary[];
  totals?: LoyaltyTotals;
  summaryGeneratedAt?: string;
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
  const normalisedAgentCode = agentCode ? agentCode.trim().toLowerCase() : undefined;
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
    const supabaseRows = await fetchLoyaltyPointRows({ agentId, agentCode, includeExpired: false });

    const agentProfile = agentId ? await fetchSupabaseAgentProfileById(agentId).catch(() => null) : null;

    let displayName = agentProfile?.displayName ?? null;
    let investorPromoCode = agentProfile?.investorPromoCode ?? null;
    let investorWhatsappLink = agentProfile?.investorWhatsappLink ?? null;
    let agentReferralLink = agentProfile?.referralLink ?? null;
    let agentReferralWhatsappLink = agentProfile?.referralWhatsappLink ?? null;
    let profileByCode: SupabaseAgentProfile | null = null;

    if ((
      !displayName ||
      !investorPromoCode ||
      !investorWhatsappLink ||
      !agentReferralLink ||
      !agentReferralWhatsappLink
    ) && agentCode) {
      profileByCode = await fetchSupabaseAgentProfileByCode(agentCode).catch(() => null);
      if (profileByCode) {
        displayName = displayName ?? profileByCode.displayName ?? profileByCode.code ?? null;
        investorPromoCode = investorPromoCode ?? profileByCode.investorPromoCode ?? null;
        investorWhatsappLink = investorWhatsappLink ?? profileByCode.investorWhatsappLink ?? null;
        agentReferralLink = agentReferralLink ?? profileByCode.referralLink ?? null;
        agentReferralWhatsappLink = agentReferralWhatsappLink ?? profileByCode.referralWhatsappLink ?? null;
      }
    }

    if (!displayName) {
      const firstWithName = supabaseRows.find((row) => row.agent_display_name && row.agent_display_name.trim().length > 0);
      if (firstWithName) {
        displayName = firstWithName.agent_display_name ?? null;
      }
    }

    if (!displayName && agentCode) {
      displayName = agentCode;
    }

    const records = mapLoyaltyPointsToPublic(supabaseRows);
    const totals = computeTotals(records);
    const summaryAgentId = agentProfile?.id ?? profileByCode?.id ?? agentId ?? (supabaseRows[0]?.agent_id ?? null);
    const monthlySummary = summaryAgentId
      ? await fetchMonthlySummaries(summaryAgentId, 12).catch(() => [] as LoyaltyMonthlySummary[])
      : [];
    const summaryGeneratedAt = new Date().toISOString();

    if (debug) {
      const allRaw = await fetchAllPostedLoyaltyPointsRaw(skipExpiry);
      const allPub = mapLoyaltyPointsToPublic(allRaw);
      const byId = agentId ? allRaw.filter((row) => row.agent_id === agentId) : [];
      const byCode = normalisedAgentCode
        ? allRaw.filter((row) => row.agent_code && row.agent_code.trim().toLowerCase() === normalisedAgentCode)
        : [];
      const ids = {
        all: allRaw.map((r) => r.id),
        byId: byId.map((r) => r.id),
        byName: [] as string[],
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
        agentReferralLink?: string | null;
        agentReferralWhatsappLink?: string | null;
        monthlySummary?: LoyaltyMonthlySummary[];
        totals?: LoyaltyTotals;
        summaryGeneratedAt?: string;
      } = {
        records,
        debug: {
          counts: { all: allRaw.length, allPub: allPub.length, byId: byId.length, byName: 0, byCode: byCode.length },
          ids,
        },
        displayName,
        investorPromoCode,
        investorWhatsappLink,
        agentReferralLink,
        agentReferralWhatsappLink,
        monthlySummary,
        totals,
        summaryGeneratedAt,
      };
      if (process.env.NODE_ENV !== 'production') body.all = allPub;
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }

    const body: CachedBody = {
      records,
      displayName,
      investorPromoCode,
      investorWhatsappLink,
      agentReferralLink,
      agentReferralWhatsappLink,
      monthlySummary,
      totals,
      summaryGeneratedAt,
    };

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

function computeTotals(records: PublicLoyaltyRow[]): LoyaltyTotals {
  const totals: LoyaltyTotals = {
    totalPoints: 0,
    positivePoints: 0,
    negativePoints: 0,
    currentMonth: 0,
    expiringSoon: 0,
  };

  if (!records.length) return totals;

  const nowTime = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const soonTime = nowTime + thirtyDaysMs;
  const currentMonthKey = monthKey(new Date(nowTime).toISOString());

  for (const row of records) {
    const points = row.points ?? 0;
    totals.totalPoints += points;

    if (points > 0) {
      totals.positivePoints += points;

      const earnedSource = row.earned_at ?? row.createdTime;
      const earnedKey = monthKey(earnedSource);
      if (earnedKey && earnedKey === currentMonthKey) {
        totals.currentMonth += points;
      }

      if (row.expires_at) {
        const expiresAt = Date.parse(row.expires_at);
        if (!Number.isNaN(expiresAt) && expiresAt >= nowTime && expiresAt <= soonTime) {
          totals.expiringSoon += points;
        }
      }
    } else if (points < 0) {
      totals.negativePoints += points;
    }
  }

  return totals;
}

function monthKey(dateIso: string | undefined): string | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
