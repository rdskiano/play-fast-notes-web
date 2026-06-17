import { supabase } from '@/lib/supabase/client';

// Lightweight first-run funnel logging (web). Each milestone writes ONE row to
// the existing `settings` table under key `onboarding.step.<step>` with a small
// JSON payload ({ at: epoch-ms, meta? }). Reusing `settings` means:
//   - NO migration / nothing to run in Supabase Studio,
//   - the settings PK (user_id, key) gives exactly one row per user per step,
//     i.e. a clean "did they reach step X, and when" reach-funnel.
// Best-effort by design: telemetry must NEVER block or break the first-run
// experience, so every error is swallowed.
//
// Query the funnel (read-only) with, e.g.:
//   select key, count(*) from settings
//   where key like 'onboarding.step.%' group by key order by key;
export async function logOnboardingStep(
  step: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const payload = { at: Date.now(), ...(meta ? { meta } : {}) };
    await supabase
      .from('settings')
      .upsert(
        { key: `onboarding.step.${step}`, value_json: JSON.stringify(payload) },
        { onConflict: 'user_id,key' },
      );
  } catch {
    // ignore — logging must not interfere with onboarding
  }
}
