import React from 'react';

const RULE_LABELS: Record<string, string> = {
  BASE: 'Base',
  HIGH_TICKET_5M_X2: 'High Ticket',
  MONTHLY_CASES_X2: 'GV 2×',
  TWO_CHANNELS: 'Two Channels',
  ROYAL_FLUSH: 'Royal Flush',
  STREAK3: 'Streak 3',
  REFERRAL_BROKER: 'Referral (Broker)',
  REFERRAL_INVESTOR: 'Referral (Investor)',
};

const TYPE_TONES: Record<string, string> = {
  base: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-200',
  multiplier: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-200',
  monthly_bonus: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200',
  referral_bonus: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200',
  redemption: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  adjustment: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700/50 dark:text-zinc-200',
  expiry: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-300',
};

type Props = {
  ruleCode: string;
  type?: string;
};

export function RuleBadge({ ruleCode, type }: Props) {
  const label = RULE_LABELS[ruleCode] || ruleCode;
  const tone = (type && TYPE_TONES[type]) || 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{label}</span>
  );
}

