'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { PublicLoyaltyRow } from '@/lib/airtable';
import { formatNumber } from '@/lib/format';
import { KpiCard } from './KpiCard';
import { PointsBreakdown } from './PointsBreakdown';
import { CatalogueGrid, type CatalogueDisplayItem } from './CatalogueGrid';
import { BuyPointsButton } from './BuyPointsButton';
import { TopupBanner } from './TopupBanner';
import { LoadingOverlay } from './LoadingOverlay';
import { NavigationTabs } from './NavigationTabs';

type Props = {
  agentId?: string;
  agentCode?: string;
  identifierLabel: string;
  activeView: 'loyalty' | 'catalogue';
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
  const currentTab: 'dashboard' | 'store' = activeView === 'catalogue' ? 'store' : 'dashboard';
  const [topupMounted, setTopupMounted] = useState(false);
  const [topupVisible, setTopupVisible] = useState(false);
  const topupHideTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  const loadCatalogue = useCallback(async () => {
    if (cataloguePrefetchedRef.current) return;
    if (catalogueFetchPromiseRef.current) {
      try {
        await catalogueFetchPromiseRef.current;
      } catch {
        /* no-op: downstream fetch can retry */
      }
      return;
    }

    const promise = (async () => {
      try {
        const response = await fetch('/api/catalogue', { cache: 'no-store' });
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

    catalogueFetchPromiseRef.current = promise;

    try {
      await promise;
    } finally {
      if (catalogueFetchPromiseRef.current === promise) {
        catalogueFetchPromiseRef.current = null;
      }
    }
  }, []);

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
    if (cataloguePrefetchedRef.current) return;
    loadCatalogue().catch(() => {});
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

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const greetingName = displayName && displayName.trim()
    ? displayName.trim()
    : identifierLabel && identifierLabel !== '—'
      ? identifierLabel
      : 'there';

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
                <div className="absolute right-2 top-0 flex -translate-y-1/2 sm:hidden">
                  <button
                    type="button"
                    onClick={toggleTopup}
                    aria-expanded={topupMounted && topupVisible}
                    className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white px-3 py-1 text-xs font-semibold text-[var(--color-outer-space)] shadow-[0_18px_30px_-22px_rgba(13,9,59,0.4)] transition hover:-translate-y-[1px] hover:shadow-[0_18px_30px_-18px_rgba(13,9,59,0.45)]"
                  >
                    <span className="text-sm leading-none">+</span>
                    <span>Top up</span>
                  </button>
                </div>
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
              router.refresh();
            }}
            className="mt-4 rounded-md border border-rose-400 px-4 py-2 text-xs font-semibold uppercase tracking-wide"
          >
            Retry now
          </button>
        </div>
      ) : activeView === 'loyalty' ? (
        <div className="view-transition grid grid-cols-3 gap-x-3 gap-y-8 sm:grid-cols-6 sm:gap-4 xl:grid-cols-12">
            <section className="col-span-3 xl:col-span-6">
              <h2 className="mb-2 text-lg font-medium">Top earning categories</h2>
              {rows === null ? (
                <TopEarningSkeleton />
              ) : (
                <PointsBreakdown
                  items={metrics.pointsByType.map((item) => ({
                    key: item.key,
                    label: item.label,
                    points: item.points,
                    rows: item.rows,
                  }))}
                />
              )}
            </section>

            <section className="col-span-3 sm:col-span-6 mt-4 xl:col-span-12 xl:mt-0">
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

        {insufficient ? (
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
            {status === 'success' ? (
              <p className="text-sm text-[var(--color-outer-space)]/70">{message ?? 'Redemption submitted successfully.'}</p>
            ) : status === 'error' ? (
              <p className="text-sm text-rose-500">{message}</p>
            ) : (
              <p className="text-sm text-[var(--color-outer-space)]/70">
                Redeem this reward using {formatNumber(requiredPoints)} points?
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={onSubmit}
                disabled={busy || status === 'success'}
                className="w-full cursor-pointer rounded-full bg-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#150f4c] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {status === 'success' ? 'Request sent' : busy ? 'Submitting…' : 'Confirm redeem'}
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-full cursor-pointer rounded-full border border-[var(--color-outer-space)] px-4 py-2 text-sm font-semibold text-[var(--color-outer-space)]/70 transition hover:bg-[var(--color-panel)]/80 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Close
              </button>
            </div>

            {status === 'success' && (
              <p className="text-xs text-[var(--color-outer-space)]/50">
                We’ll email you once the fulfilment team approves this redemption.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TopEarningSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4 xl:gap-5">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex h-full flex-col justify-between rounded-[20px] border border-[#d1b7fb]/60 bg-white/70 p-3 text-[var(--color-outer-space)] sm:rounded-[28px] sm:p-6 animate-pulse"
        >
          <div className="h-3 w-28 rounded-full bg-[#d1b7fb]/60" />
          <div className="mt-6 h-6 w-32 rounded-full bg-[#d1b7fb]/40 sm:h-10" />
        </div>
      ))}
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
