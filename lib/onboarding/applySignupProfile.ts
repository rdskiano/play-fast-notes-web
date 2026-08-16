// Copies the setup-form choices (stored as auth user metadata at signup) into
// the app's settings once a signed-in session exists.
//
// Why the indirection: with email confirmation ON there is no session at
// signup time, so the setup screen can't write settings directly — and the
// user may even confirm on a different device than the one they signed up on.
// The metadata travels with the account, so whichever device first loads the
// library signed-in lands here and finishes the job.
//
// Cross-platform: settings resolve to Supabase (web) or SQLite (native).
// Only acts on accounts that actually carry setup metadata (new-flow
// signups), so existing accounts and the demo account are never touched.

import { getSetting, setSetting } from '@/lib/db/repos/settings';
import { supabase } from '@/lib/supabase/client';

import { ONBOARDING_INSTRUMENT_KEY } from './strategyDemos';

let ranThisLoad = false;

export async function applySignupProfile(): Promise<void> {
  if (ranThisLoad) return;
  ranThisLoad = true;
  try {
    const { data } = await supabase.auth.getSession();
    const meta = data.session?.user?.user_metadata as
      | { instrument?: unknown }
      | undefined;
    const instrument = typeof meta?.instrument === 'string' ? meta.instrument : null;
    if (!instrument) return;

    const existing = await getSetting(ONBOARDING_INSTRUMENT_KEY).catch(() => null);
    if (!existing) await setSetting(ONBOARDING_INSTRUMENT_KEY, instrument);

    const seen = await getSetting('onboarding.seen').catch(() => null);
    if (seen !== 'true') await setSetting('onboarding.seen', 'true');
  } catch {
    // Best-effort; retried naturally on the next app load.
    ranThisLoad = false;
  }
}
