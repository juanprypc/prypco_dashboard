# Back to App Button Implementation

## Overview

This document describes the implementation of the "Back to App" button and responsive logo scaling for the Collect dashboard.

## Changes Made

### 1. New Component: BackToAppButton

**Location:** `components/BackToAppButton.tsx`

A reusable button component that:
- Handles deep linking back to the native Prypco One app
- Automatically detects user platform (iOS/Android) for fallback URLs
- Tracks analytics events when clicked
- Responsive design: shows "App" on mobile, "Back to App" on desktop
- Includes left arrow icon for clear navigation affordance

**Usage:**
```tsx
<BackToAppButton agentId={agentId} agentCode={agentCode} />
```

### 2. Deep Linking Configuration

**Location:** `lib/appDeepLink.ts`

Centralized configuration file for all deep linking logic:
- Custom URL scheme for the app
- App Store URLs (iOS/Android)
- Fallback behavior and timeout settings

**To Configure:**
Update the following values in `lib/appDeepLink.ts`:

```typescript
export const APP_DEEP_LINK_CONFIG = {
  // Your app's custom URL scheme (e.g., prypcoone://)
  scheme: 'prypcoone://',

  // Replace with your actual App Store ID
  iosAppStoreUrl: 'https://apps.apple.com/app/prypco-one/id123456789',

  // Replace with your actual package name
  androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=com.prypco.one',

  // Generic fallback
  fallbackUrl: 'https://prypco.com/app',

  // Time to wait before fallback (ms)
  fallbackTimeout: 2000,
};
```

### 3. Responsive Logo Scaling

**Location:** `components/DashboardClient.tsx`

The Collect logo now scales responsively:

| Screen Size | Logo Height | Description |
|-------------|-------------|-------------|
| Mobile (< 640px) | 32px | Compact for small screens |
| Tablet (640px - 768px) | 40px | Medium size |
| Desktop (> 768px) | 48px | Original size (unchanged) |

**Implementation:**
```tsx
<Image
  src="/logo.png"
  alt="Collect"
  width={195}
  height={48}
  priority
  className="h-[32px] w-auto sm:h-[40px] md:h-[48px]"
/>
```

## Visual Changes

### Before
```
┌─────────────────────────────┐
│  [Large Collect Logo]       │
│                              │
│  Dashboard  Store  Learn     │
└─────────────────────────────┘
```

### After (Mobile)
```
┌─────────────────────────────┐
│  [Logo]            [→ App]  │
│                              │
│  Dashboard  Store  Learn     │
└─────────────────────────────┘
```

### After (Desktop)
```
┌───────────────────────────────────────┐
│  [Collect Logo]  [Back to App]  Nav   │
└───────────────────────────────────────┘
```

## User Flow

1. User clicks "Back to App" button
2. Analytics event is tracked: `web_dashboard_back_to_app_clicked`
3. Attempt to open app via deep link: `prypcoone://dashboard?agent=xxx`
4. **If app installed:** App opens to dashboard with agent context preserved
5. **If app NOT installed:** After 2 seconds, redirect to:
   - iOS: App Store
   - Android: Play Store
   - Other: Generic fallback URL

## Deep Link URL Structure

The button generates deep links in the following format:

```
prypcoone://dashboard?agent={agentId}
prypcoone://dashboard?agentCode={agentCode}
prypcoone://dashboard  (if no identifiers)
```

**Your app must be configured to handle these URL schemes.**

## Platform-Specific Setup Required

### iOS Setup
1. Register custom URL scheme in `Info.plist`:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>prypcoone</string>
    </array>
  </dict>
</array>
```

2. Handle incoming URLs in AppDelegate or SceneDelegate
3. Update App Store URL in `lib/appDeepLink.ts`

### Android Setup
1. Add intent filter to `AndroidManifest.xml`:
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="prypcoone" android:host="dashboard" />
</intent-filter>
```

2. Handle intent in MainActivity
3. Update Play Store URL in `lib/appDeepLink.ts`

## Responsive Behavior

### Mobile (< 640px)
- Logo: 32px height (33% smaller than desktop)
- Button: Shows "App" with icon
- Layout: Stacks on small screens if needed

### Tablet (640px - 768px)
- Logo: 40px height (17% smaller than desktop)
- Button: Shows "App" with icon
- Layout: Single row

### Desktop (> 768px)
- Logo: 48px height (original size)
- Button: Shows "Back to App" with icon
- Layout: Single row with comfortable spacing

## Analytics Events

The following event is tracked when the button is clicked:

```typescript
emitAnalyticsEvent('web_dashboard_back_to_app_clicked', {
  agent_id: string,        // agentId or agentCode or 'unknown'
  referrer: string,        // document.referrer
});
```

**Recommended Metrics to Monitor:**
- Click-through rate on "Back to App" button
- % of successful app opens vs app store redirects
- Session duration before returning to app
- Bounce rate (users who immediately want to return)

## Accessibility Features

- **ARIA Label:** "Return to Prypco One app"
- **Keyboard Navigation:** Fully keyboard accessible
- **Focus States:** Custom focus ring with brand colors
- **Active States:** Visual feedback on click (`active:scale-95`)
- **SVG Icon:** Marked as `aria-hidden="true"` (decorative)

## Browser Compatibility

- **Modern Browsers:** Full support (Chrome, Safari, Firefox, Edge)
- **Deep Linking:** Works on iOS Safari, Android Chrome, and in-app browsers
- **Fallback:** Graceful degradation if deep linking not supported

## Testing Checklist

- [ ] Logo scales correctly on mobile (32px), tablet (40px), desktop (48px)
- [ ] "Back to App" button appears on all views (Dashboard, Store, Learn)
- [ ] Button shows "App" on mobile, "Back to App" on desktop
- [ ] Deep link opens app when installed
- [ ] Fallback redirects to App Store/Play Store when app not installed
- [ ] Analytics event fires on button click
- [ ] Button is keyboard accessible
- [ ] Focus states are visible
- [ ] Works in iOS Safari
- [ ] Works in Android Chrome
- [ ] Works in in-app browsers (Facebook, Instagram, etc.)

## Known Limitations

1. **Deep Linking in Some Browsers:** Some browsers (notably Chrome on iOS) may not support custom URL schemes. The fallback will trigger in these cases.

2. **In-App Browsers:** Social media in-app browsers may block deep links. Consider adding a banner: "Open in Safari/Chrome for best experience."

3. **Cross-Origin Detection:** We use `document.hasFocus()` to detect if the app opened. This works in most cases but may have edge cases in some browsers.

## Future Enhancements (Optional)

1. **First-Visit Tooltip:**
   ```tsx
   "💡 Tip: Tap 'Back to App' to return"
   ```

2. **Exit Intent Handling:**
   Detect browser back button and attempt to return to app

3. **Loading State:**
   Show spinner while attempting deep link

4. **Smart Banner:**
   iOS Smart App Banner for native installation prompt

## Maintenance

**When to Update:**
- App Store URLs change
- Package name/bundle ID changes
- URL scheme changes
- Deep link structure changes

**How to Update:**
Simply edit `lib/appDeepLink.ts` - all components will automatically use the new configuration.

## Support

If users report issues with the "Back to App" button:
1. Verify they have the app installed
2. Check that URL scheme matches app configuration
3. Verify App Store URLs are correct
4. Test on the user's specific device/OS combination
5. Check analytics to see if event is firing
