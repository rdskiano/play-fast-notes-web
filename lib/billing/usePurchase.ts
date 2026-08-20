// NATIVE purchase hook — Apple In-App Purchase via expo-iap (StoreKit 2).
// The web sibling (usePurchase.web.ts) drives the existing Stripe checkout;
// both expose the same shape so PaywallModal stays one shared file.
//
// Flow: the paywall mounts this hook only while it's open (the buy section
// is unmounted when the modal is hidden, so StoreKit connects on demand).
// buy() → Apple's purchase sheet → onPurchaseSuccess hands us the signed
// transaction (purchase.purchaseToken is a JWS signed by Apple) → we send it
// to the verify-apple-purchase edge function, which checks Apple's signature
// server-side and writes the same lifetime-pro subscriptions row a Stripe
// checkout writes → only then do we finishTransaction and report unlocked.
//
// If the server call fails we deliberately do NOT finish the transaction:
// StoreKit redelivers unfinished transactions on the next connection, and
// "Restore purchase" covers the user in the meantime. Money is never lost to
// a flaky network — worst case the unlock arrives on the next try.

import { useEffect, useRef, useState } from 'react';

import {
  ErrorCode,
  getAvailablePurchases,
  useIAP,
  type Purchase,
} from 'expo-iap';

import {
  IAP_PRODUCT_ID_LIFETIME,
  PRICE_LIFETIME_LABEL,
} from '@/constants/billing';
import { supabase } from '@/lib/supabase/client';

import { bumpSubscriptionRefresh } from './subscriptionRefresh';

export type PurchaseApi = {
  /** Price to show on the buy button — the store's localized price once
   *  loaded, the constant label as a fallback while loading. */
  priceLabel: string;
  /** True on iOS where a "Restore purchase" affordance is required. */
  canRestore: boolean;
  busy: boolean;
  error: string | null;
  /** Purchase or restore completed AND the server confirmed the unlock. */
  unlocked: boolean;
  buy: () => void;
  restore: () => void;
};

const VERIFY_FUNCTION = 'verify-apple-purchase';

const SERVER_FAIL_MSG =
  'Apple approved the purchase but we could not confirm it with our server. ' +
  'Nothing is lost: check your connection and tap "Restore purchase" in a moment.';
const CLAIMED_MSG =
  'This App Store purchase already unlocked a different Play Fast Notes ' +
  'account. Sign in to that account, or contact rdskiano@gmail.com.';

async function verifyOnServer(
  jws: string,
): Promise<{ ok: boolean; message: string | null }> {
  const { data, error } = await supabase.functions.invoke(VERIFY_FUNCTION, {
    body: { jws },
  });
  if (error) return { ok: false, message: SERVER_FAIL_MSG };
  const res = data as { ok?: boolean; reason?: string } | null;
  if (res?.ok === true) return { ok: true, message: null };
  return {
    ok: false,
    message: res?.reason === 'claimed' ? CLAIMED_MSG : SERVER_FAIL_MSG,
  };
}

export function usePurchase(): PurchaseApi {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  // The success callback can fire more than once (StoreKit replays unfinished
  // transactions); this keeps a second delivery from double-verifying.
  const handledTx = useRef<Set<string>>(new Set());

  const { connected, products, fetchProducts, requestPurchase, finishTransaction } =
    useIAP({
      onPurchaseSuccess: (purchase) => {
        void handlePurchase(purchase);
      },
      onPurchaseError: (e) => {
        setBusy(false);
        if (e.code === ErrorCode.UserCancelled) return;
        setError(e.message || 'The purchase could not be completed.');
      },
    });

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: [IAP_PRODUCT_ID_LIFETIME], type: 'in-app' }).catch(
      () => {
        // Price stays on the fallback label; buy() will surface a real error.
      },
    );
    // fetchProducts identity is stable per connection; re-run on reconnect only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function handlePurchase(purchase: Purchase) {
    const jws = purchase.purchaseToken;
    const txKey = purchase.transactionId ?? jws ?? 'unknown';
    if (handledTx.current.has(txKey)) return;
    handledTx.current.add(txKey);

    if (purchase.productId !== IAP_PRODUCT_ID_LIFETIME || !jws) {
      setBusy(false);
      return;
    }
    const verdict = await verifyOnServer(jws);
    if (!verdict.ok) {
      handledTx.current.delete(txKey);
      setBusy(false);
      setError(verdict.message);
      return;
    }
    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch {
      // Already-finished transactions throw; the unlock is recorded either way.
    }
    bumpSubscriptionRefresh();
    setBusy(false);
    setError(null);
    setUnlocked(true);
  }

  function buy() {
    if (busy || unlocked) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        await requestPurchase({
          request: {
            apple: {
              sku: IAP_PRODUCT_ID_LIFETIME,
              // Ties the App Store transaction to this account in Apple's
              // records (shows up inside the signed transaction payload).
              appAccountToken: userId ?? null,
            },
          },
          type: 'in-app',
        });
        // Resolution happens via onPurchaseSuccess / onPurchaseError.
      } catch {
        // requestPurchase rejections also flow through onPurchaseError; this
        // catch only guards against a pre-flight throw (e.g. not connected).
        setBusy(false);
      }
    })();
  }

  function restore() {
    if (busy || unlocked) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const purchases = await getAvailablePurchases();
        const match = purchases.find(
          (p) => p.productId === IAP_PRODUCT_ID_LIFETIME && p.purchaseToken,
        );
        if (!match) {
          setBusy(false);
          setError('No previous purchase was found on this Apple account.');
          return;
        }
        const verdict = await verifyOnServer(match.purchaseToken!);
        if (!verdict.ok) {
          setBusy(false);
          setError(verdict.message);
          return;
        }
        try {
          await finishTransaction({ purchase: match, isConsumable: false });
        } catch {
          // Restored purchases are usually already finished — fine.
        }
        bumpSubscriptionRefresh();
        setBusy(false);
        setUnlocked(true);
      } catch {
        setBusy(false);
        setError('Could not reach the App Store. Try again in a moment.');
      }
    })();
  }

  const storePrice = products.find(
    (p) => p.id === IAP_PRODUCT_ID_LIFETIME,
  )?.displayPrice;

  return {
    priceLabel: storePrice ?? PRICE_LIFETIME_LABEL,
    canRestore: true,
    busy,
    error,
    unlocked,
    buy,
    restore,
  };
}
