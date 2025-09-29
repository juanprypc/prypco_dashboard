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
  'inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-medium transition sm:px-6 sm:text-base';
const activeClass =
  'bg-white text-[var(--color-outer-space)] shadow-[0_12px_35px_-22px_rgba(13,9,59,0.6)]';
const inactiveClass =
  'bg-[var(--color-panel)] text-[var(--color-outer-space)]/70 hover:text-[var(--color-outer-space)]';

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
