'use client';

import Link from 'next/link';

type Tab = 'dashboard' | 'store' | 'learn';

type Props = {
  activeTab: Tab;
  dashboardHref: string;
  storeHref: string;
  learnHref: string;
};

const baseClass =
  'inline-flex items-center justify-center text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-electric-purple)] sm:text-base';
const activeClass =
  'rounded-full bg-white px-4 py-2 text-[var(--color-outer-space)] shadow-[0_12px_35px_-22px_rgba(13,9,59,0.6)] sm:px-6';
const inactiveClass =
  'px-1 py-2 text-[var(--color-outer-space)]/65 hover:text-[var(--color-outer-space)] hover:underline hover:underline-offset-4 sm:px-2';

export function NavigationTabs({ activeTab, dashboardHref, storeHref, learnHref }: Props) {
  const tabs: Array<{ key: Tab; label: string; href: string }> = [
    { key: 'dashboard', label: 'Dashboard', href: dashboardHref },
    { key: 'store', label: 'Store', href: storeHref },
    { key: 'learn', label: 'Learn More', href: learnHref },
  ];

  return (
    <nav aria-label="Primary" className="flex gap-2 sm:gap-3">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`${baseClass} ${tab.key === activeTab ? activeClass : inactiveClass}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
