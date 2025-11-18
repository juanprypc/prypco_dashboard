import type { CatalogueItemWithAllocations } from '@/lib/airtable';

const AIRTABLE_ATTACHMENT_HOSTS = new Set(['v5.airtableusercontent.com', 'dl.airtable.com']);
const EXPIRY_SEGMENT_REGEX = /^\d{13}$/;
const MIN_TTL_SECONDS = 60;

function toPositiveInt(value: string | number | undefined, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}
const CACHE_ENV = process.env.VERCEL_ENV?.toUpperCase() === 'PREVIEW' ? 'preview' : 'production';
export const DEFAULT_CATALOGUE_TTL_SECONDS = toPositiveInt(process.env.CATALOGUE_CACHE_TTL, 3600);
export const CATALOGUE_CACHE_KEY = `catalogue:latest:${CACHE_ENV}`;
export const AIRTABLE_SIGNED_URL_LIFETIME_SECONDS = toPositiveInt(
  process.env.AIRTABLE_SIGNED_URL_LIFETIME,
  3 * 60 * 60,
);
export const AIRTABLE_SIGNED_URL_REFRESH_BUFFER_SECONDS = toPositiveInt(
  process.env.AIRTABLE_SIGNED_URL_REFRESH_BUFFER,
  15 * 60,
);

const SAFE_CACHE_TTL_CAP_SECONDS = Math.max(
  AIRTABLE_SIGNED_URL_LIFETIME_SECONDS - AIRTABLE_SIGNED_URL_REFRESH_BUFFER_SECONDS,
  MIN_TTL_SECONDS,
);

export function getSafeCatalogueCacheTtl(requestedTtlSeconds = DEFAULT_CATALOGUE_TTL_SECONDS): number {
  const sanitized = Number.isFinite(requestedTtlSeconds) && requestedTtlSeconds > 0
    ? requestedTtlSeconds
    : DEFAULT_CATALOGUE_TTL_SECONDS;
  const lowerBounded = Math.max(sanitized, MIN_TTL_SECONDS);
  return Math.min(lowerBounded, SAFE_CACHE_TTL_CAP_SECONDS);
}

export type CatalogueCachePayload = {
  items: CatalogueItemWithAllocations[];
  fetchedAt: string;
};

export function catalogueCacheHasExpiringAsset(
  cache: CatalogueCachePayload,
  nowMs = Date.now(),
): boolean {
  const bufferMs = AIRTABLE_SIGNED_URL_REFRESH_BUFFER_SECONDS * 1000;
  return cache.items.some((item) => {
    if (hasAttachmentExpiringSoon(item, bufferMs, nowMs)) return true;
    if (
      item.unitAllocations?.some(
        (allocation) => allocation.pictureUrl && isSignedUrlExpiring(allocation.pictureUrl, bufferMs, nowMs),
      )
    ) {
      return true;
    }
    return false;
  });
}

function hasAttachmentExpiringSoon(
  item: CatalogueItemWithAllocations,
  bufferMs: number,
  nowMs: number,
): boolean {
  const attachments = Array.isArray(item.fields?.image) ? item.fields.image : [];
  if (!attachments?.length) return false;

  return attachments.some((attachment) => {
    if (!attachment || typeof attachment !== 'object') return false;
    const candidateUrls: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string') candidateUrls.push(value);
    };

    push((attachment as { url?: string }).url);
    const thumbnails = (attachment as { thumbnails?: Record<string, { url?: string }> }).thumbnails;
    if (thumbnails) {
      for (const key of Object.keys(thumbnails)) {
        push(thumbnails[key]?.url);
      }
    }

    return candidateUrls.some((url) => isSignedUrlExpiring(url, bufferMs, nowMs));
  });
}

function isSignedUrlExpiring(url: string, bufferMs: number, nowMs: number): boolean {
  const expiryMs = getSignedUrlExpiryMs(url);
  if (!expiryMs) return false;
  return nowMs >= expiryMs - bufferMs;
}

function getSignedUrlExpiryMs(url: string): number | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!AIRTABLE_ATTACHMENT_HOSTS.has(parsed.hostname)) {
    return null;
  }

  const candidates = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => (EXPIRY_SEGMENT_REGEX.test(segment) ? Number(segment) : null))
    .filter((value): value is number => Number.isFinite(value));

  if (!candidates.length) {
    return null;
  }

  return Math.max(...candidates);
}
