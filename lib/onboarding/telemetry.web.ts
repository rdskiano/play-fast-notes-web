import { supabase } from '@/lib/supabase/client';

// First-run funnel logging (web), anonymous-capable.
//
// The value-first onboarding runs BEFORE sign-up, so most of the funnel is
// anonymous — the old per-user `settings` rows couldn't capture it. Instead we
// write to `onboarding_funnel` keyed by a per-browser anon id, so a logged-out
// visitor's steps are recorded and can be stitched into one journey (the anon
// id survives in localStorage through sign-up, so `landed → … → signed_up`
// share it). Insert-only for the anon/authenticated roles; reads go through the
// analytics MCP (service role, bypasses RLS).
//
// One row per (anon_id, step) via ignore-duplicate upsert → a clean reach
// funnel. Query, e.g.:
//   select step, count(*) from onboarding_funnel group by step order by 2 desc;
// Best-effort by design: every error is swallowed so logging never breaks the
// first-run experience.

const ANON_KEY = 'pfn:anon-id';

function anonId(): string {
  try {
    if (typeof localStorage === 'undefined') return 'no-storage';
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      // crypto.randomUUID is undefined on insecure contexts (LAN HTTP dev), so
      // fall back to a plain random string there.
      const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
      id =
        c && typeof c.randomUUID === 'function'
          ? c.randomUUID()
          : `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export async function logOnboardingStep(
  step: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    // Plain insert (NOT upsert): PostgREST upserts trip RLS when there's no
    // SELECT policy, and we want insert-only anyway. The (anon_id, step) PK
    // means the first event per visitor-per-step lands and repeats just error
    // with a duplicate-key (swallowed) — which is exactly the reach funnel.
    await supabase.from('onboarding_funnel').insert({
      anon_id: anonId(),
      step,
      meta: meta ?? null,
    });
  } catch {
    // ignore — logging must not interfere with onboarding
  }
}
