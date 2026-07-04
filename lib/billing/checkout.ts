// Native checkout stub. The one-time $19.99 unlock is web-only (Stripe);
// the iOS in-app purchase (a non-consumable + Restore Purchases) is Phase 2.
// The paywall UI catches this and points the user at playfastnotes.com.
//
// App Store note: since the May 2025 guideline change, US-storefront apps
// MAY link out to a web purchase — but only the US storefront. When the
// paywall goes live on native, region-gate any external purchase link.

export async function startCheckout(): Promise<void> {
  throw new Error('Purchase on the web for now — playfastnotes.com.');
}
