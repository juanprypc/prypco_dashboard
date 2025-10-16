'use client';

import { track } from '@vercel/analytics';

type AnalyticsValue = string | number | boolean | null;

export function emitAnalyticsEvent(event: string, properties?: Record<string, AnalyticsValue>) {
  try {
    track(event, properties);
  } catch {
    // no-op
  }
}
