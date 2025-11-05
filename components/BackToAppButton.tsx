'use client';

import { useCallback } from 'react';
import { emitAnalyticsEvent } from '@/lib/clientAnalytics';
import { buildAppDeepLink, getFallbackUrl, APP_DEEP_LINK_CONFIG } from '@/lib/appDeepLink';

type Props = {
  agentId?: string;
  agentCode?: string;
  className?: string;
};

export function BackToAppButton({ agentId, agentCode, className }: Props) {
  const handleBackToApp = useCallback(() => {
    const analyticsId = agentId ?? agentCode ?? 'unknown';

    emitAnalyticsEvent('web_dashboard_back_to_app_clicked', {
      agent_id: analyticsId,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
    });

    if (typeof window === 'undefined') return;

    const appDeepLink = buildAppDeepLink({ agentId, agentCode });
    const fallbackUrl = getFallbackUrl();

    // Try deep link first
    window.location.href = appDeepLink;

    // Fallback to app store if deep link didn't work
    // (User will still be on the page if app didn't open)
    setTimeout(() => {
      if (document.hasFocus()) {
        window.location.href = fallbackUrl;
      }
    }, APP_DEEP_LINK_CONFIG.fallbackTimeout);
  }, [agentId, agentCode]);

  // Subtle outline style to differentiate utility action from navigation
  const baseClasses =
    'inline-flex items-center justify-center gap-1.5 rounded-full ' +
    'bg-white/80 backdrop-blur-sm px-4 py-2 ' +
    'text-[var(--color-outer-space)] border border-[var(--color-outer-space)]/20 ' +
    'text-xs font-medium transition-all duration-200 ' +
    'hover:bg-white hover:border-[var(--color-outer-space)]/40 hover:shadow-[0_8px_20px_-12px_rgba(13,9,59,0.3)] ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-electric-purple)] ' +
    'active:scale-[0.98] ' +
    'sm:px-6 sm:text-base';

  const finalClassName = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <button
      type="button"
      onClick={handleBackToApp}
      className={finalClassName}
      aria-label="Return to Prypco One app"
    >
      <svg
        className="h-4 w-4 sm:h-4 sm:w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span>
        <span className="hidden sm:inline">Back to App</span>
        <span className="sm:hidden">App</span>
      </span>
    </button>
  );
}
