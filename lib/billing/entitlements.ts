// Who gets Pro, and why. One shared file for web + native — it reads only
// Supabase auth state and the subscriptions row (via useSubscription), both
// of which exist on each platform.
//
// Precedence, first match wins:
//   1. PAYWALL_ENABLED off            → pro ('paywall-off')
//   2. active pro / comp row          → pro ('subscription')   [bought the
//        one-time unlock (lifetime 'pro' row) OR holds a comp grant; the
//        reason string keeps its historical 'subscription' value]
//   3. account younger than 30 days   → pro ('trial'), with days remaining
//   4. otherwise                      → free
//
// No session at all (native before sign-in) counts as free ONLY when the
// paywall is on; while it's off, rule 1 keeps everything open.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { PAYWALL_ENABLED, TRIAL_DAYS } from '@/constants/billing';
import { supabase } from '@/lib/supabase/client';
import { useSubscription } from '@/lib/supabase/subscription';

export type ProReason = 'paywall-off' | 'subscription' | 'trial' | 'none';

export type Entitlement = {
  /** Still resolving auth — treat as Pro to avoid flashing locks. */
  loading: boolean;
  isPro: boolean;
  reason: ProReason;
  /** Whole days of trial left, only set while reason === 'trial'. */
  trialDaysLeft?: number;
  /** When the free month ends (created_at + 30d), only while reason === 'trial'.
   *  Lets the account screen show the same "free through <date>" shape the
   *  comp cohorts get — user-facing vocabulary is "free month", not "trial". */
  trialEndsAtMs?: number;
};

const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

// Native (iOS) is fully unlocked until Apple in-app purchase exists (the
// declared Phase 2). Rationale: native has no sign-in by default (no session
// → no trial), no purchase path, and no restore — so a paywall there is a
// pure dead end on exactly the content the iPad is best at (PDF parts), and
// pointing buyers at the website is App Store rejection bait. This also
// matches what the June 2026 App Store build already does (built while
// PAYWALL_ENABLED was false). Ralph approved 2026-07-04. Remove this when
// IAP ships.
const PLATFORM_SELLS = Platform.OS === 'web';

export function deriveEntitlement(
  createdAtMs: number | null,
  subscriptionActive: boolean,
  nowMs: number,
): Entitlement {
  if (!PAYWALL_ENABLED || !PLATFORM_SELLS) {
    return { loading: false, isPro: true, reason: 'paywall-off' };
  }
  if (subscriptionActive) {
    return { loading: false, isPro: true, reason: 'subscription' };
  }
  if (createdAtMs !== null && nowMs - createdAtMs < TRIAL_MS) {
    const trialDaysLeft = Math.max(
      1,
      Math.ceil((createdAtMs + TRIAL_MS - nowMs) / (24 * 60 * 60 * 1000)),
    );
    return {
      loading: false,
      isPro: true,
      reason: 'trial',
      trialDaysLeft,
      trialEndsAtMs: createdAtMs + TRIAL_MS,
    };
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
