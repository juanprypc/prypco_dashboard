'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { PublicLoyaltyRow } from '@/lib/airtable';
import { formatNumber, formatPoints } from '@/lib/format';
import { KpiCard } from './KpiCard';
import { CatalogueGrid, type CatalogueDisplayItem } from './CatalogueGrid';
import { BuyPointsButton } from './BuyPointsButton';
import { TopupBanner } from './TopupBanner';
import { LoadingOverlay } from './LoadingOverlay';
import { NavigationTabs } from './NavigationTabs';
import { ReferralCard, REFERRAL_CARD_BASE_CLASS } from './ReferralCard';
import LearnMoreGraphic from '@/image_assets/Frame 1.png';

type Props = {
  agentId?: string;
  agentCode?: string;
  identifierLabel: string;
  activeView: 'loyalty' | 'catalogue' | 'learn';
  topupStatus: 'success' | 'cancel' | null;
  minTopup: number;
  pointsPerAed: number;
  ledgerHref: string;
  catalogueHref: string;
  learnHref: string;
  baseQuery: string;
};

type LedgerResponse = {
  records: PublicLoyaltyRow[];
  displayName?: string | null;
  investorPromoCode?: string | null;
  investorWhatsappLink?: string | null;
};

type CatalogueResponse = {
  items: Array<{
    id: string;
    createdTime: string;
    fields: Record<string, unknown>;
  }>;
};

const MAX_RETRIES = 3;

function monthKey(dateIso: string): string {
  const d = new Date(dateIso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildCatalogue(items: CatalogueResponse['items']): CatalogueDisplayItem[] {
  return items.map((item) => {
    const imagesRaw = item.fields?.image as
      | Array<{ url?: string; thumbnails?: { large?: { url?: string } } }>
      | undefined;
    const image = Array.isArray(imagesRaw) ? imagesRaw[0] : undefined;
    const descriptionRaw = item.fields?.description as unknown;
    let description: string | undefined;
    if (typeof descriptionRaw === 'string') description = descriptionRaw;
    else if (descriptionRaw && typeof descriptionRaw === 'object' && 'value' in descriptionRaw) {
      description = String((descriptionRaw as { value?: unknown }).value ?? '');
    }

    const rawName = item.fields?.name;
    const name = typeof rawName === 'string' && rawName.trim() ? rawName : 'Reward';

    return {
      id: item.id,
      name,
      description,
      priceAED: typeof item.fields?.price_aed === 'number' ? item.fields?.price_aed : null,
      points: typeof item.fields?.points === 'number' ? item.fields?.points : null,
      link: typeof item.fields?.Link === 'string' && item.fields?.Link.trim() ? item.fields?.Link.trim() : null,
      imageUrl: typeof image?.thumbnails?.large?.url === 'string' ? image.thumbnails.large.url : image?.url || null,
    };
  });
}

const ActivitySection = lazy(() => import('./ActivitySection'));

export function DashboardClient({
  agentId,
  agentCode,
  identifierLabel,
  activeView,
  topupStatus,
  minTopup,
  pointsPerAed,
  ledgerHref,
  catalogueHref,
  learnHref,
  baseQuery,
}: Props) {
  const [rows, setRows] = useState<PublicLoyaltyRow[] | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueDisplayItem[] | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [investorPromoCodeState, setInvestorPromoCodeState] = useState<string | null>(null);
  const [investorWhatsappLinkState, setInvestorWhatsappLinkState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryDelay, setRetryDelay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const cataloguePrefetchedRef = useRef(false);
  const catalogueFetchPromiseRef = useRef<Promise<void> | null>(null);
  const [redeemItem, setRedeemItem] = useState<CatalogueDisplayItem | null>(null);
  const [redeemStatus, setRedeemStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const currentMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
  const isMountedRef = useRef(true);
  const currentTab: 'dashboard' | 'store' | 'learn' =
    activeView === 'catalogue' ? 'store' : activeView === 'learn' ? 'learn' : 'dashboard';
  const [topupMounted, setTopupMounted] = useState(false);
  const [topupVisible, setTopupVisible] = useState(false);
  const topupHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const catalogueImageRefreshInFlightRef = useRef(false);
  const topupTriggerRef = useRef<HTMLButtonElement | null>(null);
  const topupCloseButtonRef = useRef<HTMLButtonElement | null>(null);

  const openTopup = useCallback(() => {
    if (topupHideTimerRef.current) {
      clearTimeout(topupHideTimerRef.current);
      topupHideTimerRef.current = null;
    }
    setTopupMounted(true);
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => setTopupVisible(true));
    } else {
      setTopupVisible(true);
    }
  }, []);

  const closeTopup = useCallback(() => {
    setTopupVisible(false);
  }, []);

  const toggleTopup = useCallback(() => {
    if (topupMounted && topupVisible) {
      closeTopup();
    } else {
      openTopup();
    }
  }, [closeTopup, openTopup, topupMounted, topupVisible]);

  const identifierParams = useMemo(() => {
    const params = new URLSearchParams(baseQuery);
    params.delete('view');
    if (agentId) params.set('agent', agentId);
    else params.delete('agent');
    if (agentCode) params.set('agentCode', agentCode);
    else params.delete('agentCode');
    return params;
  }, [agentId, agentCode, baseQuery]);

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
    } catch (error) {
      // ignore and fall back below
    }
    if (typeof document === 'undefined') return;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }, []);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://collect.prypco.com';
  const agentReferralLink = `${appUrl}/refer/agent`;
  const fallbackInvestorPromoCode = 'COLLECT2025';
  const fallbackInvestorWhatsappHref = `https://wa.me/971555555555?text=${encodeURIComponent(
    'Hi! I would like to chat about the Prypco investor programme.'
  )}`;
  const investorPromoCodeValue = investorPromoCodeState ?? fallbackInvestorPromoCode;
  const investorWhatsappHref = investorWhatsappLinkState ?? fallbackInvestorWhatsappHref;

  const openWhatsapp = useCallback((href: string) => {
    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener');
    }
  }, []);

  useEffect(() => {
    if (!topupVisible && topupMounted) {
      topupHideTimerRef.current = setTimeout(() => {
        setTopupMounted(false);
        topupTriggerRef.current?.focus();
        topupHideTimerRef.current = null;
      }, 200);
      return () => {
        if (topupHideTimerRef.current) {
          clearTimeout(topupHideTimerRef.current);
          topupHideTimerRef.current = null;
        }
      };
    }
  }, [topupVisible, topupMounted]);

  useEffect(() => {
    if (!topupMounted) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTopup();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [topupMounted, closeTopup]);

  useEffect(() => {
    if (!topupMounted) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [topupMounted]);

  useEffect(() => {
    if (!topupMounted || !topupVisible) return;
    const timeout = setTimeout(() => {
      topupCloseButtonRef.current?.focus();
    }, 180);
    return () => clearTimeout(timeout);
  }, [topupMounted, topupVisible]);

  useEffect(() => {
    if (topupStatus) {
      closeTopup();
    }
  }, [topupStatus, closeTopup]);

  useEffect(() => {
    return () => {
      if (topupHideTimerRef.current) {
        clearTimeout(topupHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const loadCatalogue = useCallback(async ({ forceFresh = false }: { forceFresh?: boolean } = {}) => {
    if (!forceFresh) {
      if (cataloguePrefetchedRef.current) return;
      if (catalogueFetchPromiseRef.current) {
        try {
          await catalogueFetchPromiseRef.current;
        } catch {
          /* no-op: downstream fetch can retry */
        }
        return;
      }
    }

    const promise = (async () => {
      try {
        const response = await fetch(`/api/catalogue${forceFresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as CatalogueResponse;
        if (!response.ok) {
          const message = typeof body === 'object' && body && 'error' in body ? (body as { error?: string }).error : null;
          throw new Error(message || 'Failed to load catalogue');
        }
        if (!isMountedRef.current) return;
        cataloguePrefetchedRef.current = true;
        setCatalogue(buildCatalogue(body.items ?? []));
      } catch (err) {
        if (!isMountedRef.current) return;
        cataloguePrefetchedRef.current = false;
        throw err;
      }
    })();

    if (!forceFresh) catalogueFetchPromiseRef.current = promise;

    try {
      await promise;
    } finally {
      if (!forceFresh && catalogueFetchPromiseRef.current === promise) {
        catalogueFetchPromiseRef.current = null;
      }
    }
  }, []);

  const handleCatalogueImageError = useCallback(() => {
    if (catalogueImageRefreshInFlightRef.current) return;
    catalogueImageRefreshInFlightRef.current = true;
    loadCatalogue({ forceFresh: true })
      .catch(() => {})
      .finally(() => {
        catalogueImageRefreshInFlightRef.current = false;
      });
  }, [loadCatalogue]);

  useEffect(() => {
    let cancelled = false;

    async function loadData(attempt = 0) {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setRetryDelay(null);

      try {
        const params = new URLSearchParams(identifierParams);
        const loyaltyUrl = `/api/loyalty?${params.toString()}`;
        const ledgerRes = await fetch(loyaltyUrl, { cache: 'no-store' });

        if (ledgerRes.status === 429) {
          throw { retryable: true, message: 'Airtable is busy' };
        }
        if (!ledgerRes.ok) {
          throw new Error((await ledgerRes.json().catch(() => ({}))).error || 'Failed to load ledger');
        }

        const ledgerJson = (await ledgerRes.json()) as LedgerResponse;
        if (cancelled) return;
        setRows(ledgerJson.records);
        setDisplayName(ledgerJson.displayName ?? null);
        setInvestorPromoCodeState(ledgerJson.investorPromoCode ?? null);
        setInvestorWhatsappLinkState(ledgerJson.investorWhatsappLink ?? null);

        setLastUpdated(new Date());
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const retryable = typeof err === 'object' && err !== null && 'retryable' in err;
        if (retryable && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          setRetryDelay(delay / 1000);
          retryTimerRef.current = setTimeout(() => loadData(attempt + 1), delay);
          return;
        }
        const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to load data';
        setError(message);
        setLoading(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [identifierParams]);

  useEffect(() => {
    loadCatalogue().catch(() => {});
  }, [loadCatalogue]);

  useEffect(() => {
    if (activeView !== 'catalogue') return;
    loadCatalogue({ forceFresh: true }).catch(() => {});
  }, [activeView, loadCatalogue]);

  const metrics = useMemo(() => {
    if (!rows?.length) {
      return {
        totalPosted: 0,
        expiringSoon: 0,
        currentMonth: 0,
        positivePoints: 0,
        negativePoints: 0,
        pointsByType: [] as { key: string; label: string; points: number; rows: number }[],
        last20: [] as PublicLoyaltyRow[],
      };
    }

    const now = new Date();
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 30);

    const totalPosted = rows.reduce((acc, r) => acc + (r.points || 0), 0);
    const expiringSoon = rows
      .filter((r) => r.points > 0 && r.expires_at)
      .filter((r) => {
        const exp = new Date(r.expires_at as string);
        return exp >= now && exp <= soon;
      })
      .reduce((acc, r) => acc + r.points, 0);

    const currentMonthKey = monthKey(now.toISOString());
    const currentMonth = rows
      .filter((r) => monthKey(r.earned_at ?? r.createdTime) === currentMonthKey)
      .filter((r) => r.points > 0)
      .reduce((acc, r) => acc + r.points, 0);

    const positivePoints = rows.filter((r) => r.points > 0).reduce((acc, r) => acc + r.points, 0);
    const negativePoints = rows.filter((r) => r.points < 0).reduce((acc, r) => acc + r.points, 0);

    const pointsByType = Array.from(
      rows.reduce((acc, row) => {
        const rawLabel = row.type_display_name?.trim() || row.type || 'Other';
        const key = rawLabel.toLowerCase();
        const current = acc.get(key) ?? { label: rawLabel, points: 0, rows: 0 };
        current.points += row.points;
        current.rows += 1;
        acc.set(key, current);
        return acc;
      }, new Map<string, { label: string; points: number; rows: number }>())
    )
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);

    return {
      totalPosted,
      expiringSoon,
      currentMonth,
      positivePoints,
      negativePoints,
      pointsByType,
      last20: rows.slice(0, 20),
    };
  }, [rows]);

  const topHighlightItems = useMemo(() => metrics.pointsByType.slice(0, 3), [metrics.pointsByType]);

  const topEarningCards = useMemo<ReactNode[]>(() => {
    if (rows === null) {
      return Array.from({ length: 3 }, (_, i) => (
        <div
          key={`top-skeleton-${i}`}
          className={`${REFERRAL_CARD_BASE_CLASS} animate-pulse bg-white/70 text-transparent`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-white/80" />
            <div className="h-3 w-3/4 rounded-full bg-white/75" />
            <div className="h-3 w-2/3 rounded-full bg-white/60" />
          </div>
        </div>
      ));
    }

    if (!topHighlightItems.length) {
      return [
        <div key="top-empty" className={`${REFERRAL_CARD_BASE_CLASS} text-xs text-[var(--color-outer-space)]/70`}>
          <p className="text-sm font-semibold">No earnings yet</p>
          <p>Your activity will appear here soon.</p>
        </div>,
      ];
    }

    return topHighlightItems.map((item) => (
      <TopHighlightCard key={`top-${item.key}`} label={item.label} points={item.points} rows={item.rows} />
    ));
  }, [rows, topHighlightItems]);

  const referralCards: ReactNode[] = [
    <ReferralCard
      key="ref-agent"
      title="Refer an Agent"
      description="Invite a colleague to Prypco One and earn XYD Collect."
      primaryLabel="Copy link"
      primarySuccessLabel="Link copied!"
      onPrimaryClick={() => copyToClipboard(agentReferralLink)}
    />,
    <ReferralCard
      key="ref-investor"
      title="Refer an Investor"
      description="Share Prypco Blocks or Mint with investors and earn rewards."
      primaryLabel="Share via WhatsApp"
      primarySuccessLabel=""
      onPrimaryClick={() => openWhatsapp(investorWhatsappHref)}
      codeValue={investorPromoCodeValue ?? undefined}
      codeCopyLabel="Copy"
      codeCopySuccessLabel="Copied!"
      onCodeCopy={() => copyToClipboard(investorPromoCodeValue)}
    />,
  ];

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const greetingName = displayName && displayName.trim()
    ? displayName.trim()
    : identifierLabel && identifierLabel !== '—'
      ? identifierLabel
      : 'there';

  if (activeView === 'learn') {
    return (
      <div className="space-y-8 text-[var(--color-outer-space)]">
        <div className="relative overflow-hidden rounded-[31px] border border-transparent bg-[var(--color-hero)] px-4 py-6 sm:px-10 sm:py-12">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Image src="/logo.png" alt="Collect" width={195} height={48} priority />
            <NavigationTabs
              activeTab="learn"
              dashboardHref={ledgerHref}
              storeHref={catalogueHref}
              learnHref={learnHref}
            />
          </div>

          <div className="mt-8 space-y-4 text-center">
            <h1 className="text-[26px] font-semibold leading-tight sm:text-[56px] lg:text-[64px]">Learn more</h1>
            <p className="mx-auto max-w-2xl text-sm leading-snug text-[var(--color-outer-space)]/75 sm:text-xl">
              Know your Collect points at a glance.
            </p>
          </div>
        </div>

        <section className="view-transition">
          <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[32px] border border-[#d1b7fb]/70 bg-white shadow-[0_18px_45px_-40px_rgba(13,9,59,0.35)]">
            <Image
              src={LearnMoreGraphic}
              alt="Collect points reference graphic"
              className="h-auto w-full"
              placeholder="blur"
              sizes="(max-width: 768px) 90vw, (max-width: 1200px) 80vw, 1024px"
              priority
            />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-10 text-[var(--color-outer-space)]">
      <LoadingOverlay visible={loading && !rows && !error} />
      <div className="relative overflow-hidden rounded-[31px] border border-transparent bg-[var(--color-hero)] px-4 py-6 sm:px-10 sm:py-12">
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        >
          <source src="/video/collect-loop.webm" type="video/webm" />
        </video>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_10%,rgba(234,213,254,0.65)_0%,rgba(206,174,255,0.45)_45%,rgba(150,130,255,0.2)_75%,transparent_100%)]" />

        <div className="relative z-10 flex flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Image src="/logo.png" alt="Collect" width={195} height={48} priority />
            <NavigationTabs
              activeTab={currentTab}
              dashboardHref={ledgerHref}
              storeHref={catalogueHref}
              learnHref={learnHref}
            />
          </div>

          <div className="space-y-4 text-center">
            <h1 className="break-words text-[26px] font-semibold leading-tight sm:text-[56px] lg:text-[64px]">
              Hello, <span className="italic">{greetingName}</span>.
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-snug text-[var(--color-outer-space)]/75 sm:text-xl">
              Track your transactions, points, and rewards, all in one place.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-x-3 gap-y-6 justify-items-stretch text-left sm:grid-cols-6 sm:gap-4 sm:text-center xl:grid-cols-12">
            <div className="col-span-1 w-full sm:col-span-2 xl:col-span-4">
              <div className="relative">
                <KpiCard
                  title="Collected points"
                  value={metrics.totalPosted}
                  unit="points"
                  animate
                  headerAccessory={
                    <button
                      ref={topupTriggerRef}
                      type="button"
                      onClick={toggleTopup}
                      aria-expanded={topupMounted && topupVisible}
                      className="hidden items-center gap-1 rounded-full border border-transparent px-3 py-1 text-sm font-semibold text-[var(--color-outer-space)] transition hover:border-[var(--color-outer-space)]/30 hover:bg-white/70 sm:inline-flex"
                    >
                      <span className="text-lg leading-none">+</span>
                      <span>Top up</span>
                    </button>
                  }
                />
                <button
                  type="button"
                  onClick={toggleTopup}
                  aria-expanded={topupMounted && topupVisible}
                  className="absolute bottom-2 right-2 inline-flex items-center gap-[2px] text-[8px] font-semibold text-[var(--color-outer-space)] sm:hidden"
                >
                  <span className="text-[10px] leading-none">+</span>
                  <span>Top up</span>
                </button>
              </div>
            </div>
            <div className="col-span-1 w-full sm:col-span-2 xl:col-span-4">
              <KpiCard title="Due to expire in 30 days" value={metrics.expiringSoon} unit="points" animate />
            </div>
            <div className="col-span-1 w-full sm:col-span-2 xl:col-span-4">
              <KpiCard title={`Collected in ${currentMonthName}`} value={metrics.currentMonth} unit="points" animate />
            </div>
          </div>

          {lastUpdatedLabel ? (
            <p className="text-right text-sm text-[var(--color-outer-space)]/60">Last updated {lastUpdatedLabel}</p>
          ) : null}
        </div>
      </div>

      {topupMounted ? (
        <div
          className={`fixed inset-0 z-[90] flex items-center justify-center px-3 py-5 sm:px-6 sm:py-6 ${
            topupVisible ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <div
            className={`absolute inset-0 bg-[var(--color-desert-dust)]/70 backdrop-blur-[2px] transition-opacity duration-200 ease-out ${
              topupVisible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeTopup}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="topup-heading"
            className={`relative z-10 w-full max-w-md origin-top rounded-[28px] border border-[#d1b7fb]/70 bg-white/95 p-5 text-[var(--color-outer-space)] shadow-[0_45px_100px_-55px_rgba(13,9,59,0.65)] transition duration-200 ease-out ${
              topupVisible
                ? 'translate-y-0 scale-100 opacity-100'
                : 'translate-y-5 scale-[0.97] opacity-0'
            } sm:p-6`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="topup-heading" className="text-base font-semibold sm:text-lg">
                  Top up balance
                </h2>
                <p className="mt-1 text-xs text-[var(--color-outer-space)]/70 sm:text-sm">
                  Add more points instantly. We’ll launch Stripe Checkout when you confirm.
                </p>
              </div>
              <button
                ref={topupCloseButtonRef}
                type="button"
                onClick={closeTopup}
                className="rounded-full border border-transparent bg-[var(--color-panel)] px-3 py-1 text-xs font-medium text-[var(--color-outer-space)]/60 transition hover:border-[var(--color-outer-space)]/20 hover:bg-white hover:text-[var(--color-outer-space)] sm:text-sm"
              >
                Close
              </button>
            </div>
            <div className="mt-5 max-h-[65vh] overflow-y-auto rounded-[24px] border border-[#d1b7fb]/60 bg-white/95 p-4 shadow-[0_28px_70px_-60px_rgba(13,9,59,0.45)] sm:mt-6">
              <BuyPointsButton
                agentId={agentId}
                agentCode={agentCode}
                baseQuery={identifierParams.toString()}
                minAmount={minTopup}
                pointsPerAed={pointsPerAed}
                className="border-none bg-transparent p-0 shadow-none h-auto"
              />
            </div>
          </div>
        </div>
      ) : null}

      {topupStatus ? <TopupBanner status={topupStatus} /> : null}

      {retryDelay ? (
        <div className="mb-4 rounded-2xl border border-[#d1b7fb] bg-white px-4 py-3 text-sm text-[var(--color-outer-space)] shadow-sm">
          Airtable is catching up. Retrying in {retryDelay.toFixed(0)} second{retryDelay >= 2 ? 's' : ''}…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-400/60 bg-rose-50/70 p-6 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <p className="text-sm font-semibold">We hit a snag</p>
          <p className="mt-2 text-xs">{error}</p>
          <button
            onClick={() => {
              setRows(null);
              setCatalogue(null);
              setError(null);
              setLoading(true);
              setRetryDelay(null);
              setLastUpdated(null);
              setDisplayName(null);
              setInvestorPromoCodeState(null);
              setInvestorWhatsappLinkState(null);
              router.refresh();
            }}
            className="mt-4 rounded-md border border-rose-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
          >
            Retry now
          </button>
        </div>
      ) : activeView === 'loyalty' ? (
        <div className="view-transition space-y-6">
          <div className="grid gap-3 min-[360px]:grid-cols-2 min-[600px]:grid-cols-3 lg:grid-cols-5 lg:gap-4 xl:gap-5">
            <section className="col-span-full space-y-3 min-[600px]:col-span-2 lg:col-span-3">
              <h2 className="text-lg font-medium">Top earning categories</h2>
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 min-[600px]:grid-cols-3 stagger-fade">
                {topEarningCards}
              </div>
            </section>

            <section className="col-span-full space-y-3 min-[360px]:col-span-2 lg:col-span-2">
              <h2 className="text-lg font-medium">Refer and earn</h2>
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 stagger-fade">
                {referralCards}
              </div>
            </section>
          </div>

          <section className="rounded-[26px] bg-[var(--color-background)] p-4 sm:p-6">
            <h2 className="mb-2 text-lg font-medium">Recent activity</h2>
            <Suspense fallback={<ActivitySkeleton />}>
              <ActivitySection rows={rows === null ? null : metrics.last20} loading={loading} />
            </Suspense>
          </section>
        </div>
      ) : (
        <section className="view-transition space-y-8 rounded-[32px] bg-[#F6F3F8] px-4 py-10 sm:rounded-[48px] sm:px-10 sm:py-12">
          <div className="space-y-4 text-center">
            <h2 className="text-[34px] font-medium leading-[1.1] text-[var(--color-outer-space)] sm:text-[72px] lg:text-[85px]">
              Collect Store
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-[1.3] text-[var(--color-outer-space)]/80 sm:text-[26px] lg:text-[31px]">
              Redeem your points for exclusive rewards from our curated list of items.
            </p>
          </div>

          <CatalogueGrid
            items={catalogue ?? []}
            onRedeem={(item) => {
              setRedeemItem(item);
              setRedeemStatus('idle');
              setRedeemMessage(null);
            }}
            onImageError={handleCatalogueImageError}
          />
        </section>
      )}
      {redeemItem ? (
        <RedeemDialog
          item={redeemItem}
          availablePoints={metrics.totalPosted}
          status={redeemStatus}
          message={redeemMessage}
          minAmount={minTopup}
          pointsPerAed={pointsPerAed}
          agentId={agentId}
          agentCode={agentCode}
          baseQuery={baseQuery}
          onSubmit={async () => {
            if (!redeemItem) return;
            setRedeemStatus('submitting');
            setRedeemMessage(null);
            try {
              const res = await fetch('/api/redeem', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  agentId: agentId ?? null,
                  agentCode: agentCode ?? null,
                  rewardId: redeemItem.id,
                  rewardName: redeemItem.name,
                  rewardPoints: redeemItem.points ?? null,
                  priceAed: redeemItem.priceAED ?? null,
                }),
              });
              if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json?.error || 'Redemption failed');
              }
              setRedeemStatus('success');
              setRedeemMessage('Thanks! We have received your request and will process it shortly.');
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Redemption failed';
              setRedeemStatus('error');
              setRedeemMessage(message);
            }
          }}
          onClose={() => {
            setRedeemItem(null);
            setRedeemStatus('idle');
            setRedeemMessage(null);
          }}
        />
      ) : null}
    </div>
  );
}

type RedeemDialogProps = {
  item: CatalogueDisplayItem;
  availablePoints: number;
  status: 'idle' | 'submitting' | 'success' | 'error';
  message: string | null;
  minAmount: number;
  pointsPerAed: number;
  agentId?: string | null;
  agentCode?: string | null;
  baseQuery?: string;
  onSubmit: () => void;
  onClose: () => void;
};

function RedeemDialog({
  item,
  availablePoints,
  status,
  message,
  onSubmit,
  onClose,
  minAmount,
  pointsPerAed,
  agentId,
  agentCode,
  baseQuery,
}: RedeemDialogProps) {
  const requiredPoints = typeof item.points === 'number' ? item.points : 0;
  const insufficient = requiredPoints > availablePoints;
  const busy = status === 'submitting';
  const showSuccess = status === 'success';
  const showError = status === 'error';
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);

  const extraPointsNeeded = insufficient ? requiredPoints - availablePoints : 0;

  const normaliseAmount = (value: number, min: number) => {
    if (!Number.isFinite(value) || value <= 0) return min;
    const multiples = Math.max(1, Math.ceil(value / min));
    return multiples * min;
  };

  const suggestedAed = extraPointsNeeded
    ? normaliseAmount(Math.ceil(extraPointsNeeded / pointsPerAed), minAmount)
    : minAmount;
  const suggestedPoints = suggestedAed * pointsPerAed;

  async function handleDirectTopup() {
    if (!agentId && !agentCode) {
      setTopupError('Missing agent details.');
      return;
    }
    setTopupError(null);
    setTopupBusy(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId,
          agentCode,
          amountAED: suggestedAed,
          baseQuery,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to start checkout');
      if (json?.url) {
        window.location.href = json.url as string;
      } else {
        throw new Error('Stripe session missing URL');
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Unable to open checkout';
      setTopupError(err);
      setTopupBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-desert-dust)]/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-[#d1b7fb] bg-white p-6 text-[var(--color-outer-space)] shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Redeem reward</h3>
            <p className="text-sm text-[var(--color-outer-space)]/70">{item.name}</p>
          </div>
          <button onClick={onClose} className="cursor-pointer text-sm text-[var(--color-outer-space)]/50 hover:text-[var(--color-outer-space)]">Close</button>
        </div>

        <div className="mt-4 space-y-2 text-sm text-[var(--color-outer-space)]/80">
          <div className="flex items-center justify-between">
            <span>Required points</span>
            <strong>{requiredPoints ? formatNumber(requiredPoints) : '—'} pts</strong>
          </div>
          <div className="flex items-center justify-between">
            <span>Your balance</span>
            <strong>{formatNumber(availablePoints)} pts</strong>
          </div>
        </div>

        {showSuccess ? (
          <div className="mt-8 flex flex-col items-center gap-6 text-center">
            <div className="animate-[redeemPop_320ms_ease-out]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50/40 text-emerald-600">
                <svg
                  viewBox="0 0 52 52"
                  className="h-9 w-9 text-current"
                  aria-hidden
                >
                  <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.2" />
                  <path
                    d="M16 27.5 23.5 34l12.5-15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-[4] [stroke-dasharray:48] [stroke-dashoffset:48] animate-[redeemCheck_420ms_ease-out_forwards]"
                  />
                </svg>
              </div>
            </div>
            <div className="space-y-2 text-sm text-[var(--color-outer-space)]/80">
              <p className="text-base font-semibold text-[var(--color-outer-space)]">Request sent!</p>
              <p className="text-xs leading-snug text-[var(--color-outer-space)]/70">
                Expect your new balance to show up within the next minute.
              </p>
              <p className="text-[11px] leading-snug text-[var(--color-outer-space)]/60">
                We’ll email you once the fulfilment team approves this redemption. Feel free to continue browsing rewards.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] sm:w-auto"
            >
              Back to rewards
            </button>
          </div>
        ) : insufficient ? (
          <div className="mt-6 space-y-4 text-sm">
            <p>You need {formatNumber(requiredPoints - availablePoints)} more points to redeem this reward.</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={handleDirectTopup}
                disabled={topupBusy}
                className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {topupBusy
                  ? 'Redirecting…'
                  : `Buy ${formatNumber(suggestedPoints)} pts (AED ${formatNumber(suggestedAed)})`}
              </button>
            </div>
            {topupError ? <p className="text-xs text-rose-500">{topupError}</p> : null}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {showError ? (
              <p className="text-sm text-rose-500">{message}</p>
            ) : (
              <p className="text-sm text-[var(--color-outer-space)]/70">
                Redeem this reward using {formatNumber(requiredPoints)} points?
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={onSubmit}
                disabled={busy}
                className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {busy ? 'Submitting…' : 'Confirm redeem'}
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full cursor-pointer rounded-full border border-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:bg-[var(--color-panel)]/80 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TopHighlightCard({
  label,
  points,
  rows,
}: {
  label: string;
  points: number;
  rows: number;
}) {
  return (
    <div className={REFERRAL_CARD_BASE_CLASS}>
      <div className="flex w-full flex-col items-center gap-2 text-center">
        <p className="text-sm font-semibold leading-snug text-[var(--color-outer-space)] min-[420px]:text-base">
          {label}
        </p>
      </div>
      <div className="mt-auto flex flex-col items-center gap-1">
        <p className="text-2xl font-semibold text-[var(--color-outer-space)] min-[420px]:text-[28px]">
          {formatPoints(points)} pts
        </p>
        <p className="text-[11px] text-[var(--color-outer-space)]/60">
          {rows === 1 ? '1 transaction' : `${rows} transactions`}
        </p>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center justify-between rounded-[20px] border border-[#d1b7fb]/50 bg-white/70 px-4 py-3 shadow-sm animate-pulse"
        >
          <div className="h-3 w-28 rounded-full bg-[#d1b7fb]/70" />
          <div className="h-3 w-16 rounded-full bg-[#d1b7fb]/50" />
        </div>
      ))}
    </div>
  );
}
