/**
 * Deep linking configuration for returning to the native app
 *
 * Update these values based on your actual app configuration:
 * - Custom URL scheme (e.g., prypcoone://)
 * - App Store URLs
 * - Play Store URLs
 */

export const APP_DEEP_LINK_CONFIG = {
  // Custom URL scheme for deep linking
  // This should match the URL scheme registered in your iOS/Android app
  scheme: 'prypcoone://',

  // iOS App Store URL
  // Replace with your actual App Store ID
  iosAppStoreUrl: 'https://apps.apple.com/app/prypco-one/id123456789',

  // Android Play Store URL
  // Replace with your actual package name
  androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=com.prypco.one',

  // Generic fallback URL
  fallbackUrl: 'https://prypco.com/app',

  // Timeout before attempting fallback (milliseconds)
  fallbackTimeout: 2000,
} as const;

/**
 * Generates a deep link URL to the app dashboard
 */
export function buildAppDeepLink(params?: { agentId?: string; agentCode?: string }): string {
  const { scheme } = APP_DEEP_LINK_CONFIG;
  const baseUrl = `${scheme}dashboard`;

  if (params?.agentId) {
    return `${baseUrl}?agent=${params.agentId}`;
  }

  if (params?.agentCode) {
    return `${baseUrl}?agentCode=${params.agentCode}`;
  }

  return baseUrl;
}

/**
 * Gets the appropriate fallback URL based on user's platform
 */
export function getFallbackUrl(): string {
  if (typeof navigator === 'undefined') {
    return APP_DEEP_LINK_CONFIG.fallbackUrl;
  }

  const userAgent = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isAndroid = /android/i.test(userAgent);

  if (isIOS) {
    return APP_DEEP_LINK_CONFIG.iosAppStoreUrl;
  }

  if (isAndroid) {
    return APP_DEEP_LINK_CONFIG.androidPlayStoreUrl;
  }

  return APP_DEEP_LINK_CONFIG.fallbackUrl;
}
