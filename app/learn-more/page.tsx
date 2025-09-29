import Image from 'next/image';
import { NavigationTabs } from '@/components/NavigationTabs';
import LearnMoreGraphic from '@/image_assets/Frame 1.png';

export default async function LearnMorePage({
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

  const baseParams = new URLSearchParams();
  if (agentId) baseParams.set('agent', agentId);
  if (agentCode) baseParams.set('agentCode', agentCode);

  const dashboardHref = (() => {
    const params = new URLSearchParams(baseParams);
    params.delete('view');
    const qs = params.toString();
    return qs ? `/dashboard?${qs}` : '/dashboard';
  })();

  const storeHref = (() => {
    const params = new URLSearchParams(baseParams);
    params.set('view', 'catalogue');
    return `/dashboard?${params.toString()}`;
  })();

  const learnHref = (() => {
    const params = new URLSearchParams(baseParams);
    const qs = params.toString();
    return qs ? `/learn-more?${qs}` : '/learn-more';
  })();

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-8 px-4 pb-12 pt-6 sm:px-6">
      <header className="rounded-[31px] border border-transparent bg-[var(--color-hero)] px-4 py-6 text-[var(--color-outer-space)] sm:px-10 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Image src="/logo.png" alt="Collect" width={195} height={48} priority />
          <NavigationTabs
            activeTab="learn"
            dashboardHref={dashboardHref}
            storeHref={storeHref}
            learnHref={learnHref}
          />
        </div>

        <div className="mt-8 space-y-4 text-center">
          <h1 className="text-[26px] font-semibold leading-tight sm:text-[56px] lg:text-[64px]">Learn more</h1>
          <p className="mx-auto max-w-2xl text-sm leading-snug text-[var(--color-outer-space)]/75 sm:text-xl">
            Know your Collect points at a glance.
          </p>
        </div>
      </header>

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
