import { DashboardClient } from '@/components/DashboardClient';

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const agentParam = sp?.agent;
  const agentCodeParam = sp?.agentCode;
  const rawAgentId = Array.isArray(agentParam) ? agentParam[0] : agentParam;
  const rawAgentCode = Array.isArray(agentCodeParam) ? agentCodeParam[0] : agentCodeParam;

  const looksLikeRecordId = (value?: string | null) => Boolean(value && value.startsWith('rec'));

  const agentId = looksLikeRecordId(rawAgentId) ? rawAgentId : undefined;
  const agentCode = rawAgentCode ?? (looksLikeRecordId(rawAgentId) ? undefined : rawAgentId);

  const topupParam = sp?.topup;
  const topupStatusRaw = Array.isArray(topupParam) ? topupParam[0] : topupParam;
  const topupStatus = topupStatusRaw === 'success' ? 'success' : topupStatusRaw === 'cancel' ? 'cancel' : null;

  const viewParam = sp?.view;
  const view = Array.isArray(viewParam) ? viewParam[0] : viewParam;
  const activeView = view === 'catalogue' ? 'catalogue' : 'loyalty';

  const minTopup = Number(process.env.MIN_TOPUP_AED || 500);
  const pointsPerAed = Number(process.env.POINTS_PER_AED || 2);

  if (!agentId && !agentCode) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Loyalty Dashboard</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Provide either an{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">?agent=recXXXXXXXX</code> or{' '}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">?agentCode=AG12345</code> query to view your ledger.
        </p>
        <p className="text-xs text-zinc-500">
          In production, this will be injected via auth (JWT/Clerk middleware).
        </p>
      </div>
    );
  }

  const baseParams = new URLSearchParams();
  if (agentId) baseParams.set('agent', agentId);
  if (agentCode) baseParams.set('agentCode', agentCode);
  if (view) baseParams.set('view', view);
  const baseQuery = baseParams.toString();

  const ledgerHref = (() => {
    const params = new URLSearchParams(baseParams);
    params.delete('view');
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : '/dashboard';
  })();

  const catalogueHref = (() => {
    const params = new URLSearchParams(baseParams);
    params.set('view', 'catalogue');
    return `/dashboard?${params.toString()}`;
  })();

  const learnHref = (() => {
    const params = new URLSearchParams(baseParams);
    params.delete('view');
    const qs = params.toString();
    return qs ? `/learn-more?${qs}` : '/learn-more';
  })();

  const identifierLabel = agentId || agentCode || '—';

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-8 px-3 pb-12 pt-6 sm:px-6">
      <DashboardClient
        agentId={agentId}
        agentCode={agentCode}
        identifierLabel={identifierLabel}
        activeView={activeView}
        topupStatus={topupStatus}
        minTopup={minTopup}
        pointsPerAed={pointsPerAed}
        ledgerHref={ledgerHref}
        catalogueHref={catalogueHref}
        learnHref={learnHref}
        baseQuery={baseQuery}
      />
    </div>
  );
}
