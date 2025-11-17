'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PublicLoyaltyRow } from '@/lib/airtable';
import { formatPoints } from '@/lib/format';
import { KpiCard } from './KpiCard';
import { CatalogueGrid, type CatalogueDisplayItem, type CatalogueUnitAllocation } from './CatalogueGrid';
import { BuyPointsButton } from './BuyPointsButton';
import { TopupBanner } from './TopupBanner';
import { LoadingOverlay } from './LoadingOverlay';
import { NavigationTabs } from './NavigationTabs';
import { ReferralCard, REFERRAL_CARD_BASE_CLASS } from './ReferralCard';
import { BackToAppButton } from './BackToAppButton';
import LearnMoreGraphic from '@/image_assets/Frame 1.png';
import { getCatalogueStatusConfig } from '@/lib/catalogueStatus';
import { emitAnalyticsEvent } from '@/lib/clientAnalytics';
import {
  DamacRedemptionFlow,
  TokenRedemptionFlow,
  SimpleRedemptionFlow,
  RedemptionProvider,
  useRedemptionContext,
} from './redeem';

type Props = {
  agentId?: string;
  agentCode?: string;
  identifierLabel: string;
  activeView: 'loyalty' | 'catalogue' | 'learn';
  topupStatus: 'success' | 'cancel' | null;
  autoOpenRewardId?: string;
  autoSelectAllocationId?: string;
  autoVerifiedLerCode?: string;
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
  agentReferralLink?: string | null;
  agentReferralWhatsappLink?: string | null;
};

type CatalogueResponseItem = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
  unitAllocations?: Array<{
    id: string;
    unitType: string | null;
    maxStock: number | null;
    points: number | null;
    pictureUrl: string | null;
    priceAed: number | null;
    propertyPrice?: number | null;
  }>;
};

type CatalogueResponse = {
  items: CatalogueResponseItem[];
};

const MAX_RETRIES = 3;

const LEARN_FAQ_ITEMS: Array<{ question: string; answer: ReactNode }> = [
  {
    question: 'Can I buy points, or do I only earn them through the app?',
    answer: (
      <p>
        Yes, you can both earn points through the app and buy extra points. You can top up your balance anytime in the Collect
        Dashboard.
      </p>
    ),
  },
  {
    question: 'Do my points expire?',
    answer: (
      <p>
        Yes. Points expire 1 year after they are earned. For example, if you earn 6,000 points on 18 September 2025, they will
        expire on 18 September 2026.
      </p>
    ),
  },
  {
    question: 'How fast will I get my points after buying them?',
    answer: <p>Purchased points are credited instantly and will appear directly in your dashboard.</p>,
  },
  {
    question: 'Is there a limit to how many points I can buy?',
    answer: (
      <p>
        Yes. The minimum purchase is AED 250 (500 points), and the maximum purchase is AED 500,000 (1,000,000 points).
      </p>
    ),
  },
  {
    question: 'How do I earn points on transactions and referrals?',
    answer: (
      <div className="space-y-2">
        <p>
          <strong>Property Transactions:</strong> 3,000 points per AED 1M. Example: A AED 2.1M property transaction = 6,300
          points (credited once the deal is closed).
        </p>
        <p>
          <strong>Mortgage Referrals:</strong> 1,500 points per AED 1M. Example: A AED 3.3M mortgage = 4,950 points (credited once
          the mortgage is disbursed).
        </p>
        <p>
          <strong>Golden Visa Referrals (VIP/VVIP only):</strong> 1,500 points per successful case. Example: 2 Golden Visa referrals =
          3,000 points.
        </p>
      </div>
    ),
  },
  {
    question: 'Can I track how many points I’ve earned?',
    answer: <p>Yes. You can track and redeem your points directly from your Collect Dashboard on the PRYPCO One app.</p>,
  },
];

const formatAedFull = (value?: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `AED ${value.toLocaleString()}`;
};

function monthKey(dateIso: string): string {
  const d = new Date(dateIso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildCatalogue(items: CatalogueResponse['items']): CatalogueDisplayItem[] {
  const toBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalised = value.trim().toLowerCase();
      return normalised === 'true' || normalised === 'checked' || normalised === '1' || normalised === 'yes';
    }
    return false;
  };

  const toStatus = (value: unknown): CatalogueDisplayItem['status'] => {
    if (typeof value !== 'string') return null;
    const normalised = value.trim().toLowerCase();
    if (normalised === 'coming soon' || normalised === 'coming_soon') return 'coming_soon';
    if (normalised === 'last units' || normalised === 'last_units') return 'last_units';
    if (normalised === 'sold out' || normalised === 'sold_out') return 'sold_out';
    if (normalised === 'active') return 'active';
    return null;
  };

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
    const tcRaw = item.fields?.['T&C'];
    const tcText = typeof tcRaw === 'string' && tcRaw.trim() ? tcRaw.trim() : null;
    const tcActiveRaw = item.fields?.['T&C_active'];
    const tcActive = !!tcText && toBoolean(tcActiveRaw);
    const tcVersionRaw = item.fields?.['T&C_version'];
    const tcVersion = typeof tcVersionRaw === 'string' && tcVersionRaw.trim() ? tcVersionRaw.trim() : null;
    const tcUrlRaw = item.fields?.['T&C_url'];
    const tcUrl = typeof tcUrlRaw === 'string' && tcUrlRaw.trim() ? tcUrlRaw.trim() : null;
    const tcSignature = tcActive
      ? tcVersion || `${tcText.length}:${tcText.slice(0, 64)}`
      : null;
    const requiresAgencyConfirmation = toBoolean(item.fields?.unit_allocation);
    const status = toStatus(item.fields?.status_project_allocation);

    const unitAllocations: CatalogueUnitAllocation[] = [];
    if (Array.isArray(item.unitAllocations)) {
      for (const allocation of item.unitAllocations) {
        const id = typeof allocation.id === 'string' ? allocation.id.trim() : null;
        if (!id) continue;
        unitAllocations.push({
          id,
          unitType: allocation.unitType ?? null,
          maxStock: typeof allocation.maxStock === 'number' ? allocation.maxStock : null,
          points: typeof allocation.points === 'number' ? allocation.points : null,
          pictureUrl: typeof allocation.pictureUrl === 'string' ? allocation.pictureUrl : null,
          priceAed: typeof allocation.priceAed === 'number' ? allocation.priceAed : null,
          propertyPrice:
            typeof allocation.propertyPrice === 'number' ? allocation.propertyPrice : undefined,
        });
      }
    }

    const category: 'token' | 'reward' = unitAllocations.length > 0 ? 'token' : 'reward';
    const requiresBuyerVerification = toBoolean(item.fields?.requiresBuyerVerification);

    return {
      id: item.id,
      name,
      description,
      priceAED: typeof item.fields?.price_aed === 'number' ? item.fields?.price_aed : null,
      points: typeof item.fields?.points === 'number' ? item.fields?.points : null,
      link: typeof item.fields?.Link === 'string' && item.fields?.Link.trim() ? item.fields?.Link.trim() : null,
      imageUrl: typeof image?.thumbnails?.large?.url === 'string' ? image.thumbnails.large.url : image?.url || null,
      status,
      requiresAgencyConfirmation,
      termsActive: tcActive,
      requiresBuyerVerification,
      termsText: tcText,
      termsVersion: tcVersion,
      termsUrl: tcUrl,
      termsSignature: tcSignature,
      unitAllocations,
      category,
      damacIslandCampaign: toBoolean(item.fields?.damacIslandCampaign),
    };
  });
}

const ActivitySection = lazy(() => import('./ActivitySection'));

export function DashboardClient(props: Props) {
  return (
    <RedemptionProvider>
      <DashboardContent {...props} />
    </RedemptionProvider>
  );
}

function DashboardContent({
  agentId,
  agentCode,
  identifierLabel,
  activeView,
  topupStatus,
  autoOpenRewardId,
  autoSelectAllocationId,
  autoVerifiedLerCode,
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
  const [agentReferralLinkState, setAgentReferralLinkState] = useState<string | null>(null);
  const [agentReferralWhatsappLinkState, setAgentReferralWhatsappLinkState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryDelay, setRetryDelay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const cataloguePrefetchedRef = useRef(false);
  const catalogueFetchPromiseRef = useRef<Promise<void> | null>(null);
  const catalogueTrackedRef = useRef(false);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);
  const [forceFreshLoyalty, setForceFreshLoyalty] = useState(false);
  const [damacRedeemItem, setDamacRedeemItem] = useState<CatalogueDisplayItem | null>(null);
  const [damacAutoRestore, setDamacAutoRestore] = useState<{ allocationId: string; lerCode: string } | null>(null);
  const [tokenRedeemItem, setTokenRedeemItem] = useState<CatalogueDisplayItem | null>(null);
  const [simpleRedeemItem, setSimpleRedeemItem] = useState<CatalogueDisplayItem | null>(null);
  const searchParams = useSearchParams();
  const { hasAcceptedTerms, showTermsDialog, requireTermsAcceptance } = useRedemptionContext();

  // Initialize filter from URL or default to 'all'
  const [catalogueFilter, setCatalogueFilter] = useState<'all' | 'token' | 'reward'>(() => {
    const filterParam = searchParams?.get('filter');
    if (filterParam === 'token' || filterParam === 'reward') {
      return filterParam;
    }
    return 'all';
  });

  const currentMonthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
  const analyticsAgentId = agentId ?? agentCode ?? 'unknown';

  // Helper to update filter and sync URL
  const updateCatalogueFilter = useCallback(
    (filter: 'all' | 'token' | 'reward') => {
      setCatalogueFilter(filter);
      emitAnalyticsEvent('catalogue_filter_changed', { filter });

      // Update URL without page reload
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (filter === 'all') {
        params.delete('filter'); // Clean URL when "all"
      } else {
        params.set('filter', filter);
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  // Filter catalogue items based on selected category
  const filteredCatalogue = useMemo(() => {
    if (!catalogue) return null;
    if (catalogueFilter === 'all') return catalogue;
    return catalogue.filter((item) => item.category === catalogueFilter);
  }, [catalogue, catalogueFilter]);

  // Calculate counts for each category
  const catalogueCounts = useMemo(() => {
    if (!catalogue) return { all: 0, token: 0, reward: 0 };
    const tokenCount = catalogue.filter((item) => item.category === 'token').length;
    const rewardCount = catalogue.filter((item) => item.category === 'reward').length;
    return {
      all: catalogue.length,
      token: tokenCount,
      reward: rewardCount,
    };
  }, [catalogue]);

  const startRedeemFlow = useCallback(
    (item: CatalogueDisplayItem) => {
      if (item.damacIslandCampaign) {
        setDamacRedeemItem(item);
        setDamacAutoRestore(null);
        return;
      }
      const allocations = item.unitAllocations;
      if (allocations.length > 0) {
        setTokenRedeemItem(item);
        return;
      }
      setSimpleRedeemItem(item);
    },
    [],
  );

  const closeDamacFlow = useCallback(() => {
    setDamacRedeemItem(null);
    setDamacAutoRestore(null);
  }, []);

  const handleDamacAutoRestoreConsumed = useCallback(() => {
    setDamacAutoRestore(null);
  }, []);

  const handleDamacSuccess = useCallback(() => {
    setForceFreshLoyalty(true);
  }, []);

  const handleTokenFlowClose = useCallback(() => {
    setTokenRedeemItem(null);
  }, []);

  const handleSimpleFlowClose = useCallback(() => {
    setSimpleRedeemItem(null);
  }, []);

  const handleRequestRedeem = useCallback(
    (item: CatalogueDisplayItem) => {
      if (!item.damacIslandCampaign && item.status) {
        const statusConfig = getCatalogueStatusConfig(item.status);
        if (statusConfig.redeemDisabled) {
          if (item.status === 'coming_soon') {
            emitAnalyticsEvent('coming_soon_interest', {
              agent_id: analyticsAgentId,
              reward_id: item.id,
            });
            setWaitlistMessage(`Thanks! We'll notify you when ${item.name || 'this reward'} is available.`);
          }
          return;
        }
      }
      if (item.termsActive && !hasAcceptedTerms(item)) {
        requireTermsAcceptance(item, () => startRedeemFlow(item));
        return;
      }
      startRedeemFlow(item);
    },
    [analyticsAgentId, hasAcceptedTerms, requireTermsAcceptance, startRedeemFlow],
  );

  const handleShowTerms = useCallback((item: CatalogueDisplayItem) => {
    showTermsDialog(item);
  }, [showTermsDialog]);

  const isMountedRef = useRef(true);
  const currentTab: 'dashboard' | 'store' | 'learn' =
    activeView === 'catalogue' ? 'store' : activeView === 'learn' ? 'learn' : 'dashboard';
  const [topupMounted, setTopupMounted] = useState(false);
  const [topupVisible, setTopupVisible] = useState(false);
  const topupHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const topupRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
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
    } catch {
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

  const startStripeCheckout = useCallback(
    async (amountAED: number, context?: { rewardId?: string; allocationId?: string; lerCode?: string }) => {
      if (!agentId && !agentCode) {
        throw new Error('Missing agent details.');
      }
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId,
          agentCode,
          amountAED,
          baseQuery,
          rewardId: context?.rewardId,
          allocationId: context?.allocationId,
          lerCode: context?.lerCode,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || 'Failed to start checkout');
      }
      window.location.href = json.url as string;
    },
    [agentId, agentCode, baseQuery],
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://collect.prypco.com';
  const agentReferralLinkTrimmed = agentReferralLinkState?.trim();
  const agentReferralLink = agentReferralLinkTrimmed && agentReferralLinkTrimmed.length > 0
    ? agentReferralLinkTrimmed
    : `${appUrl}/refer/agent`;
  const agentReferralDisplay = agentReferralLink.replace(/^https?:\/\//, '');
  const agentReferralWhatsappHrefTrimmed = agentReferralWhatsappLinkState?.trim();
  const agentReferralWhatsappHref = agentReferralWhatsappHrefTrimmed && agentReferralWhatsappHrefTrimmed.length > 0
    ? agentReferralWhatsappHrefTrimmed
    : null;
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

  const shareAgentReferral = useCallback(async () => {
    const link = agentReferralLink;
    if (!link) return;

    if (agentReferralWhatsappHref) {
      openWhatsapp(agentReferralWhatsappHref);
      return;
    }

    const shareText = `Join me on Prypco One — use my link: ${link}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Prypco One', text: shareText, url: link });
        return;
      }
    } catch {
      /* ignore share errors and fall back to copy */
    }

    await copyToClipboard(link);
  }, [agentReferralLink, agentReferralWhatsappHref, copyToClipboard, openWhatsapp]);

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
    if (topupStatus === 'success') {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[topup] forcing fresh loyalty fetch after Stripe success');
      }
      if (topupRefreshTimerRef.current) {
        clearTimeout(topupRefreshTimerRef.current);
        topupRefreshTimerRef.current = null;
      }
      setForceFreshLoyalty(true);
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
      if (topupRefreshTimerRef.current) {
        clearTimeout(topupRefreshTimerRef.current);
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
        if (forceFreshLoyalty) params.set('fresh', '1');
        const loyaltyUrl = `/api/loyalty?${params.toString()}`;

        // Load both loyalty and catalogue APIs in parallel for faster page load
        // Catalogue failure is non-blocking since it's only needed on Store tab
        const [ledgerRes] = await Promise.all([
          fetch(loyaltyUrl, { cache: 'no-store' }),
          loadCatalogue().catch(() => null), // Graceful catalogue failure
        ]);

        if (ledgerRes.status === 429) {
          throw { retryable: true, message: 'Airtable is busy' };
        }
        if (!ledgerRes.ok) {
          throw new Error((await ledgerRes.json().catch(() => ({}))).error || 'Failed to load ledger');
        }

        const ledgerJson = (await ledgerRes.json()) as LedgerResponse;
        if (cancelled) return;
        const clean = (value: unknown): string | null => {
          if (typeof value !== 'string') return null;
          const trimmed = value.trim();
          return trimmed.length ? trimmed : null;
        };

        setRows(ledgerJson.records);
        setDisplayName(clean(ledgerJson.displayName) ?? null);
        setInvestorPromoCodeState(clean(ledgerJson.investorPromoCode));
        setInvestorWhatsappLinkState(clean(ledgerJson.investorWhatsappLink));
        setAgentReferralLinkState(clean(ledgerJson.agentReferralLink));
        setAgentReferralWhatsappLinkState(clean(ledgerJson.agentReferralWhatsappLink));

        setLastUpdated(new Date());
        setLoading(false);
        if (forceFreshLoyalty) setForceFreshLoyalty(false);
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
        if (forceFreshLoyalty) setForceFreshLoyalty(false);
      }
    }

    loadData();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [identifierParams, forceFreshLoyalty, loadCatalogue]);

  // Ensure catalogue is loaded when switching to catalogue view
  // Uses prefetched data if available for instant rendering
  useEffect(() => {
    if (activeView !== 'catalogue') return;

    // Only load if not already loaded (leverages prefetch optimization)
    if (!catalogue) {
      loadCatalogue().catch(() => {});
    }
  }, [activeView, catalogue, loadCatalogue]);

  // Prefetch catalogue after 2 seconds of idle time on Dashboard
  // This makes Store tab feel instant when user clicks it
  useEffect(() => {
    // Only prefetch when on Dashboard view
    if (activeView !== 'loyalty') return;

    // Skip if catalogue already loaded or loading
    if (catalogue !== null) return;
    if (cataloguePrefetchedRef.current) return;
    if (catalogueFetchPromiseRef.current) return;

    // Wait 2 seconds before prefetching (user is likely reading dashboard)
    const prefetchTimer = setTimeout(() => {
      // Double-check conditions before prefetching
      if (activeView === 'loyalty' && catalogue === null) {
        loadCatalogue().catch(() => {
          // Silent failure - don't disrupt user experience
        });
      }
    }, 2000);

    // Critical: Clean up timer on unmount or view change
    return () => clearTimeout(prefetchTimer);
  }, [activeView, catalogue, loadCatalogue]);

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
          className={`${REFERRAL_CARD_BASE_CLASS} animate-pulse bg-[var(--color-background)]/80 text-transparent`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-[var(--color-background)]/70" />
            <div className="h-3 w-3/4 rounded-full bg-[var(--color-background)]/60" />
            <div className="h-3 w-2/3 rounded-full bg-[var(--color-background)]/40" />
          </div>
        </div>
      ));
    }

    if (!topHighlightItems.length) {
      return [
        <div key="top-empty" className={`${REFERRAL_CARD_BASE_CLASS} text-xs text-[var(--color-outer-space)]/70`}>
          <p className="text-sm font-semibold">Your top categories await</p>
          <p>
            Close a deal or share your referral links to unlock your first earning badge. Every transaction moves you up
            the leaderboard.
          </p>
        </div>,
      ];
    }

    return topHighlightItems.map((item) => (
      <TopHighlightCard key={`top-${item.key}`} label={item.label} points={item.points} rows={item.rows} />
    ));
  }, [rows, topHighlightItems]);

  useEffect(() => {
    if (activeView !== 'catalogue') return;
    if (!catalogue || catalogueTrackedRef.current) return;
    emitAnalyticsEvent('catalogue_view', {
      agent_id: analyticsAgentId,
      item_count: catalogue.length,
    });
    catalogueTrackedRef.current = true;
  }, [activeView, analyticsAgentId, catalogue]);

  useEffect(() => {
    if (!waitlistMessage) return;
    const timer = setTimeout(() => setWaitlistMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [waitlistMessage]);

  // Auto-restore DAMAC flow after Stripe payment
  useEffect(() => {
    if (!autoOpenRewardId || !catalogue) return;
    const item = catalogue.find((i) => i.id === autoOpenRewardId);
    if (!item) return;

    if (item.category === 'token' && item.id.includes('damac')) {
      setDamacRedeemItem(item);
      if (autoSelectAllocationId && autoVerifiedLerCode) {
        setDamacAutoRestore({
          allocationId: autoSelectAllocationId,
          lerCode: autoVerifiedLerCode,
        });
      } else {
        setDamacAutoRestore(null);
      }
    }
  }, [autoOpenRewardId, autoSelectAllocationId, autoVerifiedLerCode, catalogue, topupStatus]);

const referralCards: ReactNode[] = [
    <ReferralCard
      key="ref-agent"
      title="Refer an Agent"
      description="Invite a colleague to Prypco One and earn bonus points."
      primaryLabel="Share referral link"
      onPrimaryClick={shareAgentReferral}
      codeValue={agentReferralDisplay || undefined}
      codeCopySuccessLabel="Link copied!"
      onCodeCopy={() => copyToClipboard(agentReferralLink)}
      analyticsAgentId={analyticsAgentId}
      analyticsShareVariant="agent_share"
      analyticsCopyVariant="agent_copy"
    />,
    <ReferralCard
      key="ref-investor"
      title="Refer an Investor"
      description="Share Prypco Blocks or Mint with investors and earn 2,000 points."
      primaryLabel="Share via WhatsApp"
      onPrimaryClick={() => openWhatsapp(investorWhatsappHref)}
      codeValue={investorPromoCodeValue ?? undefined}
      codeCopySuccessLabel="Code copied!"
      onCodeCopy={() => copyToClipboard(investorPromoCodeValue)}
      analyticsAgentId={analyticsAgentId}
      analyticsShareVariant="investor_share"
      analyticsCopyVariant="investor_copy"
    />,
  ];

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const looksLikeAccountId = (value?: string | null) => {
    if (!value) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    // treat UUID or long hex strings as ids
    return /^[0-9a-f-]{20,}$/i.test(trimmed);
  };

  const preferName = (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === '—') return null;
    if (looksLikeAccountId(trimmed)) return null;
    return trimmed;
  };

  const greetingName = preferName(displayName) ?? preferName(identifierLabel) ?? 'there';

  if (activeView === 'learn') {
    return (
      <div className="space-y-8 text-[var(--color-outer-space)]">
        <div className="relative overflow-hidden rounded-[31px] border border-transparent bg-[var(--color-hero)] px-4 py-6 sm:px-10 sm:py-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3">
              <Image
                src="/logo.png"
                alt="Collect"
                width={195}
                height={48}
                priority
                className="h-[32px] w-auto sm:h-[40px] md:h-[48px]"
              />
              <div className="sm:hidden">
                <BackToAppButton agentId={agentId} agentCode={agentCode} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                <BackToAppButton agentId={agentId} agentCode={agentCode} />
              </div>
              <NavigationTabs
                activeTab="learn"
                dashboardHref={ledgerHref}
                storeHref={catalogueHref}
                learnHref={learnHref}
              />
            </div>
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

        <section className="view-transition">
          <div className="mx-auto w-full max-w-5xl space-y-6 rounded-[32px] border border-[#d1b7fb]/70 bg-white/90 px-5 py-8 shadow-[0_20px_55px_-45px_rgba(13,9,59,0.35)] sm:px-10 sm:py-10">
            <div className="space-y-2 text-left sm:text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-outer-space)]/60">
                Common questions
              </p>
              <h2 className="text-[26px] font-semibold leading-snug sm:text-[38px]">
                Everything you need to know about Collect points
              </h2>
            </div>
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 lg:gap-6">
              {LEARN_FAQ_ITEMS.map((item) => (
                <article
                  key={item.question}
                  className="flex h-full flex-col gap-2 rounded-[22px] border border-[var(--color-electric-purple)]/20 bg-white px-4 py-4 text-left text-[var(--color-outer-space)] sm:gap-3 sm:px-5 sm:py-5"
                >
                  <h3 className="text-sm font-medium leading-snug sm:text-[15px]">{item.question}</h3>
                  <div className="text-sm leading-relaxed text-[var(--color-outer-space)]/70 sm:text-[15px]">
                    {item.answer}
                  </div>
                </article>
              ))}
            </div>
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3">
              <Image
                src="/logo.png"
                alt="Collect"
                width={195}
                height={48}
                priority
                className="h-[32px] w-auto sm:h-[40px] md:h-[48px]"
              />
              <div className="sm:hidden">
                <BackToAppButton agentId={agentId} agentCode={agentCode} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:block">
                <BackToAppButton agentId={agentId} agentCode={agentCode} />
              </div>
              <NavigationTabs
                activeTab={currentTab}
                dashboardHref={ledgerHref}
                storeHref={catalogueHref}
                learnHref={learnHref}
              />
            </div>
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
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex-1">
                <h2 id="topup-heading" className="text-lg font-bold text-[var(--color-outer-space)] sm:text-xl">
                  Add Points
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-outer-space)]/60 sm:text-sm">
                  Purchase points securely with Stripe
                </p>
              </div>
              <button
                ref={topupCloseButtonRef}
                type="button"
                onClick={closeTopup}
                aria-label="Close dialog"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-outer-space)]/10 bg-white text-[var(--color-outer-space)]/50 transition-all hover:border-[var(--color-electric-purple)]/30 hover:bg-[var(--color-electric-purple)]/5 hover:text-[var(--color-electric-purple)] focus:outline-none focus:ring-2 focus:ring-[var(--color-electric-purple)]/30 sm:h-10 sm:w-10"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-5 max-h-[70vh] overflow-y-auto sm:mt-6">
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
              setAgentReferralLinkState(null);
              setAgentReferralWhatsappLinkState(null);
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

          {/* Category filter pills */}
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <button
              type="button"
              onClick={() => updateCatalogueFilter('all')}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 sm:px-6 sm:text-base ${
                catalogueFilter === 'all'
                  ? 'bg-white text-[var(--color-outer-space)] shadow-[0_12px_35px_-22px_rgba(13,9,59,0.6)]'
                  : 'border border-[var(--color-outer-space)]/15 bg-white/60 text-[var(--color-outer-space)]/70 backdrop-blur-sm hover:bg-white/80 hover:text-[var(--color-outer-space)]'
              }`}
            >
              All ({catalogueCounts.all})
            </button>
            <button
              type="button"
              onClick={() => updateCatalogueFilter('token')}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 sm:px-6 sm:text-base ${
                catalogueFilter === 'token'
                  ? 'bg-white text-[var(--color-outer-space)] shadow-[0_12px_35px_-22px_rgba(13,9,59,0.6)]'
                  : 'border border-[var(--color-outer-space)]/15 bg-white/60 text-[var(--color-outer-space)]/70 backdrop-blur-sm hover:bg-white/80 hover:text-[var(--color-outer-space)]'
              }`}
            >
              Token Allocations ({catalogueCounts.token})
            </button>
            <button
              type="button"
              onClick={() => updateCatalogueFilter('reward')}
              className={`rounded-full px-4 py-2 text-xs font-medium transition-all duration-200 sm:px-6 sm:text-base ${
                catalogueFilter === 'reward'
                  ? 'bg-white text-[var(--color-outer-space)] shadow-[0_12px_35px_-22px_rgba(13,9,59,0.6)]'
                  : 'border border-[var(--color-outer-space)]/15 bg-white/60 text-[var(--color-outer-space)]/70 backdrop-blur-sm hover:bg-white/80 hover:text-[var(--color-outer-space)]'
              }`}
            >
              Items ({catalogueCounts.reward})
            </button>
          </div>

          <CatalogueGrid
            items={filteredCatalogue ?? []}
            onRedeem={handleRequestRedeem}
            onShowTerms={handleShowTerms}
            onImageError={handleCatalogueImageError}
          />
        </section>
      )}
      {waitlistMessage ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setWaitlistMessage(null)}
        >
          <div
            className="w-full max-w-sm rounded-[26px] border border-[var(--color-electric-purple)]/30 bg-white px-5 py-6 text-center text-[var(--color-outer-space)] shadow-[0_18px_45px_-40px_rgba(13,9,59,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-outer-space)]">You&apos;re on the list</h3>
            <p className="mt-2 text-sm text-[var(--color-outer-space)]/70">{waitlistMessage}</p>
            <button
              type="button"
              onClick={() => setWaitlistMessage(null)}
              className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-[var(--color-outer-space)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-outer-space)] transition hover:bg-[var(--color-panel)]/80"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {damacRedeemItem ? (
        <DamacRedemptionFlow
          key={damacRedeemItem.id}
          item={damacRedeemItem}
          agentId={agentId}
          agentCode={agentCode}
          availablePoints={metrics.totalPosted}
          minTopup={minTopup}
          pointsPerAed={pointsPerAed}
          formatAedFull={formatAedFull}
          startStripeCheckout={startStripeCheckout}
          autoRestore={damacAutoRestore}
          onAutoRestoreConsumed={handleDamacAutoRestoreConsumed}
          onClose={closeDamacFlow}
          onSuccess={handleDamacSuccess}
        />
      ) : null}

      {tokenRedeemItem ? (
        <TokenRedemptionFlow
          key={tokenRedeemItem.id}
          item={tokenRedeemItem}
          agentId={agentId}
          agentCode={agentCode}
          availablePoints={metrics.totalPosted}
          minTopup={minTopup}
          pointsPerAed={pointsPerAed}
          baseQuery={baseQuery}
          termsAccepted={hasAcceptedTerms(tokenRedeemItem)}
          onShowTerms={handleShowTerms}
          onClose={handleTokenFlowClose}
        />
      ) : null}

      {simpleRedeemItem ? (
        <SimpleRedemptionFlow
          key={simpleRedeemItem.id}
          item={simpleRedeemItem}
          agentId={agentId}
          agentCode={agentCode}
          availablePoints={metrics.totalPosted}
          minTopup={minTopup}
          pointsPerAed={pointsPerAed}
          baseQuery={baseQuery}
          termsAccepted={hasAcceptedTerms(simpleRedeemItem)}
          onShowTerms={handleShowTerms}
          onClose={handleSimpleFlowClose}
        />
      ) : null}
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
