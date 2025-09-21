import React from 'react';

type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white/60 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{title}</p>
      {description ? <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">{description}</p> : null}
      {action}
    </div>
  );
}

