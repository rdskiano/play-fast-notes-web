// Who gets Pro, and why. One shared file for web + native — it reads only
// Supabase auth state and the subscriptions row (via useSubscription), both
// of which exist on each platform.
//
// Precedence, first match wins:
//   1. PAYWALL_ENABLED off            → pro ('paywall-off')
//   2. account older than the cutoff  → pro ('founding') — free for life
//   3. active subscription / comp row → pro ('subscription')
//   4. account younger than 14 days   → pro ('trial'), with days remaining
//   5. otherwise                      → free
//
// No session at all (native before sign-in) counts as free ONLY when the
// paywall is on; while it's off, rule 1 keeps everything open.

import { useEffect, useState } from 'react';

import {
  FOUNDING_MEMBER_CUTOFF_MS,
  PAYWALL_ENABLED,
  TRIAL_DAYS,
} from '@/constants/billing';
import { supabase } from '@/lib/supabase/client';
import { useSubscription } from '@/lib/supabase/subscription';

export type ProReason =
  | 'paywall-off'
  | 'founding'
  | 'subscription'
  | 'trial'
  | 'none';

export type Entitlement = {
  /** Still resolving auth — treat as Pro to avoid flashing locks. */
  loading: boolean;
  isPro: boolean;
  reason: ProReason;
  /** Whole days of trial left, only set while reason === 'trial'. */
  trialDaysLeft?: number;
};

const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export function deriveEntitlement(
  createdAtMs: number | null,
  subscriptionActive: boolean,
  nowMs: number,
): Entitlement {
  if (!PAYWALL_ENABLED) {
    return { loading: false, isPro: true, reason: 'paywall-off' };
  }
  if (createdAtMs !== null && createdAtMs < FOUNDING_MEMBER_CUTOFF_MS) {
    return { loading: false, isPro: true, reason: 'founding' };
  }
  if (subscriptionActive) {
    return { loading: false, isPro: true, reason: 'subscription' };
  }
  if (createdAtMs !== null && nowMs - createdAtMs < TRIAL_MS) {
    const trialDaysLeft = Math.max(
      1,
      Math.ceil((createdAtMs + TRIAL_MS - nowMs) / (24 * 60 * 60 * 1000)),
    );
    return { loading: false, isPro: true, reason: 'trial', trialDaysLeft };
  }
  return { loading: false, isPro: false, reason: 'none' };
}

/** The current user's Pro entitlement. Safe to call on any screen. */
export function useEntitlement(): Entitlement {
  const subscription = useSubscription();
  const [createdAtMs, setCreatedAtMs] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        const iso = data.session?.user.created_at;
        setCreatedAtMs(iso ? Date.parse(iso) : null);
        setLoaded(true);
      })
      .catch(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!loaded) {
    return { loading: true, isPro: true, reason: 'paywall-off' };
  }
  return deriveEntitlement(createdAtMs, subscription.isActive, Date.now());
}
