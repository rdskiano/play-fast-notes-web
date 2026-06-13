// Native checkout stub. Billing v1 is web-only (Stripe); iOS in-app
// purchase comes later. The paywall UI catches this and points the user at
// playfastnotes.com instead of calling through.
//
// App Store note: since the May 2025 guideline change, US-storefront apps
// MAY link out to a web purchase — but only the US storefront. When the
// paywall goes live on native, region-gate any external purchase link.

export type CheckoutPlan = 'annual' | 'monthly';

export async function startCheckout(_plan: CheckoutPlan): Promise<void> {
  throw new Error('Checkout is web-only for now — subscribe at playfastnotes.com.');
}
