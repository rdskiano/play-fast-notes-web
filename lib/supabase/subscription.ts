// Reads the subscriptions row for the current user and exposes a small,
// stable state object. Until Stripe ships, the only thing the client
// cares about is `isActive` — true when the user has a comp or paid tier
// with a future expiration. Expired comp rows fall back to free purely
// at read time; no cleanup job needs to touch the DB.

import { useEffect, useState } from 'react';

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

function deriveState(row: {
  tier: string | null;
  status: string | null;
  current_period_end: number | null;
} | null): SubscriptionState {
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
  const { data, error } = await supabase
    .from('subscriptions')
    .select('tier, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // RLS or network — treat as free rather than crashing the settings screen.
    return FREE_STATE;
  }
  return deriveState(
    data as { tier: string | null; status: string | null; current_period_end: number | null } | null,
  );
}

/**
 * Returns the current user's subscription state. Mirrors useSession's
 * lifecycle — subscribes to Supabase auth state and refetches when the
 * signed-in user changes.
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

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
