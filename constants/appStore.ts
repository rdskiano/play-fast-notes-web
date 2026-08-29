// The iOS app's App Store presence. One place for the URL so the sign-in
// badge, the Account section, and the What's New entry can never drift.
//
// Context (2026-08-28): the app went live 2026-08-27, but Apple's search
// index lags a new app by days, so direct links from the web app are
// currently the only reliable way anyone finds it.

export const APP_STORE_URL =
  'https://apps.apple.com/us/app/play-fast-notes/id6777245595';

/**
 * Apple's own hosted "Download on the App Store" badge (official artwork,
 * served as SVG from Apple's marketing-tools CDN). Hotlinking it is the
 * supported use and matches this codebase's CDN idiom (abcjs, pdf.js).
 * AppStoreBadge.web.tsx falls back to a plain text link if it fails to load.
 */
export const APP_STORE_BADGE_SRC =
  'https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us';
