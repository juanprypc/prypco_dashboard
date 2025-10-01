import { redirect } from 'next/navigation';

export default async function LearnMoreRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  const agent = sp.agent;
  const agentCode = sp.agentCode;
  const rawAgent = Array.isArray(agent) ? agent[0] : agent;
  const rawCode = Array.isArray(agentCode) ? agentCode[0] : agentCode;

  if (rawAgent) params.set('agent', rawAgent);
  if (rawCode) params.set('agentCode', rawCode);
  params.set('view', 'learn');

  redirect(`/dashboard?${params.toString()}`);
}
