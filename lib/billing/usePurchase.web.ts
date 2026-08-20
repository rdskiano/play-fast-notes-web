// WEB purchase hook — the existing Stripe checkout, wrapped in the same
// shape the native (Apple IAP) sibling exposes so PaywallModal stays shared.
//
// buy() hands off to Stripe and the browser navigates away on success, so
// `busy` never resolves on the happy path. Two ways the user comes BACK with
// this hook still mounted, both of which must unlock the button:
//   • they reopen the modal after "Not now" (the buy section remounts, so
//     state resets naturally), and
//   • the browser's back/forward cache restores the page mid-busy when they
//     back out of the Stripe page without paying (the pageshow listener).

import { useEffect, useState } from 'react';

import { PRICE_LIFETIME_LABEL } from '@/constants/billing';
import { startCheckout } from '@/lib/billing/checkout';

import type { PurchaseApi } from './usePurchase';

export type { PurchaseApi };

export function usePurchase(): PurchaseApi {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setBusy(false);
        setError(null);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  function buy() {
    if (busy) return;
    setBusy(true);
    setError(null);
    void startCheckout().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(false);
    });
    // On success the browser navigates away; nothing more to do here.
  }

  return {
    priceLabel: PRICE_LIFETIME_LABEL,
    canRestore: false,
    busy,
    error,
    unlocked: false,
    buy,
    restore: () => {},
  };
}
