// Reads the subscriptions row for the current user and exposes a small,
// stable state object. The only thing the client cares about is `isActive` —
// true when the user has a comp or paid tier with a future expiration.
// Expired comp rows fall back to free purely at read time; no cleanup job
// needs to touch the DB.
//
// Two hardening layers for the local-first iPad (added with Apple IAP):
//   • Offline cache. A paid user who opens the app with no network must not
//     read as free — that would lock their own music. Every successful fetch
//     writes a per-user snapshot to the same filesystem KV store the auth
//     session uses; a FAILED fetch falls back to that snapshot instead of
//     FREE_STATE. A revoked user staying unlocked while offline is the
//     acceptable direction of error.
//   • Refresh bus. After an in-app purchase/restore the paywall calls
//     bumpSubscriptionRefresh(); every mounted useSubscription() refetches
//     immediately, so gates unlock without remounting screens.

import { useEffect, useState } from 'react';

import {
  readSubscriptionCache,
  writeSubscriptionCache,
} from '@/lib/billing/subscriptionCache';
import { subscribeSubscriptionRefresh } from '@/lib/billing/subscriptionRefresh';

import { supabase } from './client';

export type SubscriptionTier = 'free' | 'comp' | 'pro';

export type SubscriptionState = {
  tier: SubscriptionTier;
  status: string | null;
  expiresAt: number | null;
  isActive: boolean;
};

const FREE_STATE: SubscriptionState = {
  tier: 'free',
  status: null,
  expiresAt: null,
  isActive: false,
};

function cacheKey(userId: string): string {
  return `pfn-subscription-cache:${userId}`;
}

type CachedRow = {
  tier: string | null;
  status: string | null;
  current_period_end: number | null;
};

async function readCachedRow(userId: string): Promise<CachedRow | null> {
  try {
    const raw = await readSubscriptionCache(cacheKey(userId));
    return raw ? (JSON.parse(raw) as CachedRow) : null;
  } catch {
    return null;
  }
}

function writeCachedRow(userId: string, row: CachedRow | null): void {
  try {
    writeSubscriptionCache(cacheKey(userId), JSON.stringify(row));
  } catch {
    // Cache is best-effort; a failed write only matters on a later offline boot.
  }
}

function deriveState(row: CachedRow | null): SubscriptionState {
  if (!row) return FREE_STATE;
  const tier: SubscriptionTier =
    row.tier === 'comp' || row.tier === 'pro' ? row.tier : 'free';
  const expiresAt = row.current_period_end ?? null;
  const isActive =
    (tier === 'comp' || tier === 'pro') &&
    row.status === 'active' &&
    expiresAt !== null &&
    expiresAt > Date.now();
  return {
    tier,
    status: row.status,
    expiresAt,
    isActive,
  };
}

async function fetchSubscriptionForUser(
  userId: string,
): Promise<SubscriptionState> {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('tier, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      // Network/RLS failure — prefer the last snapshot over locking a paid
      // user out; no snapshot means free, same as before.
      return deriveState(await readCachedRow(userId));
    }
    const row = (data as CachedRow | null) ?? null;
    writeCachedRow(userId, row);
    return deriveState(row);
  } catch {
    return deriveState(await readCachedRow(userId));
  }
}

/**
 * Returns the current user's subscription state. Mirrors useSession's
 * lifecycle — subscribes to Supabase auth state and refetches when the
 * signed-in user changes, plus refetches on bumpSubscriptionRefresh()
 * (fired after an in-app purchase or restore).
 */
export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(FREE_STATE);

  useEffect(() => {
    let mounted = true;

    async function loadForCurrent() {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        if (mounted) setState(FREE_STATE);
        return;
      }
      const next = await fetchSubscriptionForUser(userId);
      if (mounted) setState(next);
    }

    loadForCurrent();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const userId = session?.user.id;
      if (!userId) {
        setState(FREE_STATE);
        return;
      }
      fetchSubscriptionForUser(userId).then((next) => {
        if (mounted) setState(next);
      });
    });

    const unsubscribeRefresh = subscribeSubscriptionRefresh(() => {
      loadForCurrent();
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
      unsubscribeRefresh();
    };
  }, []);

  return state;
}
