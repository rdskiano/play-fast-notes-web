// Native no-op sibling of CheckoutResultModal.web.tsx. Stripe Checkout is
// web-only (Apple IAP is a later phase), so there is no ?checkout= redirect
// to handle on iOS — Metro resolves this file for native bundles.

export function CheckoutResultModal() {
  return null;
}
