// Central switchboard for the paid tier ("Practice Pro").
//
// Model:
//   • Every NEW account gets a 30-day full-Pro trial (no card), then drops
//     to the free tier unless they subscribe.
//   • Pre-launch users who actually practiced (the "warm cohort") get 6
//     months free, granted as 'comp' subscription rows at flip time (their
//     accounts are older than 30 days, so the trial alone wouldn't cover
//     them). Three named supporters get lifetime. See supabase/comp-grants.sql.
//   • Beta testers get 6 months free via a shareable Stripe promotion code
//     (100% off, 6-month duration) entered at checkout — TESTER_PROMO_CODE.
//
// PAYWALL_ENABLED is the master switch. While false, every account reads as
// Pro and nothing is gated — the paywall ships dark so it can be tested and
// then flipped without a code-change scramble.
//
// ── GO-LIVE RUNBOOK (do these in order; the FLAG FLIP IS LAST) ──────────────
// The checkout edge function is fully env-driven, so switching test → live is
// a secrets swap, not a code change. Order matters: comp grants must land
// BEFORE the flag flips, or pre-launch users get briefly walled.
//   1. Stripe → live mode: re-create the product + annual/monthly prices +
//      the BETA6 promo code (100% off, 6 cycles). Note the live price IDs.
//   2. Stripe → live Webhooks: add endpoint
//      https://uugodzwxuxgfwujnwpuq.supabase.co/functions/v1/stripe-webhook
//      for checkout.session.completed, customer.subscription.updated/deleted.
//      Copy the live whsec_… signing secret.
//   3. Supabase → Edge Functions → Secrets (dashboard; no MCP): set the LIVE
//      STRIPE_SECRET_KEY (sk_live_…), STRIPE_PRICE_ANNUAL, STRIPE_PRICE_MONTHLY,
//      STRIPE_WEBHOOK_SECRET.
//   4. Clear the 2 leftover TEST-mode 'pro' rows, then run the comp grants:
//      supabase/comp-grants.sql (warm cohort 6 mo + 3 named lifetime).
//   5. ONLY NOW flip PAYWALL_ENABLED → true here, then
//      `git push web-origin-archive master` (live deploy to playfastnotes.com).
//   6. Smoke-test: a fresh account sees the trial; a free account hits a lock.
// Native checkout still throws (Apple IAP is a separate later job).
export const PAYWALL_ENABLED = true;

// New accounts get full Pro for this long before the free tier applies.
export const TRIAL_DAYS = 30;

// Reward (months) for pre-launch users and beta testers. Pre-launch users are
// comped directly; testers redeem TESTER_PROMO_CODE at checkout. Both 6.
export const REWARD_MONTHS = 6;
export const TESTER_PROMO_CODE = 'BETA6';

// FLIP-DAY COMP GRANTS — run ONCE at the moment PAYWALL_ENABLED goes true.
// The full, runnable SQL lives in supabase/comp-grants.sql; do NOT inline a
// stale copy here. Two cohorts (decided 2026-06-25):
//   • WARM COHORT  — users with >=1 practice_log row (actually practiced):
//                    6 months free. ~27 of 77 users as of 2026-06-25.
//   • LIFETIME     — a handful of named supporters + a recurring patron:
//                    never expires; overrides the 6-month grant.
// The warm grant is guarded to never downgrade a real paid 'pro' row. Run it
// BEFORE flipping PAYWALL_ENABLED so nobody is briefly walled. (The runnable
// SQL with the actual identities is kept out of the repo — local only.)

// Free tier: this many active photo passages — marked passages that aren't from
// a PDF (legacy standalone photos + passages marked on photo/image-documents),
// counted by countActivePhotoPassages(). PDF parts (source_kind 'pdf' documents)
// are Pro-only — the serious-player workflow and the real storage cost.
export const FREE_PASSAGE_LIMIT = 3;

// Display strings used by the paywall UI. The actual amounts live in the
// Stripe Dashboard prices; keep these in sync by hand.
export const PRICE_ANNUAL_LABEL = '$39 / year';
export const PRICE_MONTHLY_LABEL = '$4.99 / month';
export const PRICE_ANNUAL_SUBLABEL = 'about $3.25 a month — best value';

// What Pro includes — shown on the paywall and the account screen. The free
// tier keeps every practice strategy on its 3 passages (a crippled free tier
// converts nobody); Pro removes the limits.
export const PRO_FEATURES = [
  'The Exercise Builder — generate notated exercises',
  'Unlimited passages and folders',
  'Full PDF parts — page turns, pencil, foot pedal',
  'Every practice strategy on all of them',
  'Supports a musician-built indie app',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// Trial-lifecycle copy. Three messages a new account meets as its free month
// of Pro plays out, plus the short badge the lock-don't-lose downgrade stamps
// on over-limit content. All in one place so the wording stays consistent and
// Ralph can edit the VOICE without hunting through screens. These are DRAFTS —
// rework freely; the surfaces just read whatever's here.
// ───────────────────────────────────────────────────────────────────────────

// Start showing the "trial ending" nudge once the trial has this many days
// (or fewer) left. 30-day trial, so this is the final stretch.
export const TRIAL_WARNING_DAYS = 5;

// (1) Welcome — shown once when a brand-new account lands, so the free month
// of Pro is a gift they know about rather than a surprise charge later.
export const TRIAL_WELCOME_TITLE = 'Your first month is on me';
export function trialWelcomeBody(): string {
  return (
    `You've got ${TRIAL_DAYS} days of full Practice Pro — every strategy, ` +
    `unlimited passages, PDF parts, the Exercise Builder. No card, no catch. ` +
    `Just play.`
  );
}

// (2) Warning — shown in the final stretch of the trial (<= TRIAL_WARNING_DAYS).
// Honest about what changes, gentle about it. Your music never goes anywhere.
export function trialEndingTitle(daysLeft: number): string {
  return daysLeft <= 1 ? 'Your Pro trial ends tomorrow' : `${daysLeft} days of Pro left`;
}
export function trialEndingBody(daysLeft: number): string {
  const when = daysLeft <= 1 ? 'Tomorrow' : `In ${daysLeft} days`;
  return (
    `${when} your free month wraps up. Keep Pro for ${PRICE_ANNUAL_LABEL} ` +
    `(${PRICE_ANNUAL_SUBLABEL}) or ${PRICE_MONTHLY_LABEL}. ` +
    `If you don't, nothing is deleted — your library stays put, with your ` +
    `first ${FREE_PASSAGE_LIMIT} passages free to keep practicing.`
  );
}

// (3) Downgrade — shown once after the trial (or a paid plan) lapses. The
// whole point of "lock-don't-lose": reassure first, then explain the lock.
export const DOWNGRADE_TITLE = 'You’re on the free plan now';
export function downgradeBody(lockedCount: number): string {
  const locked =
    lockedCount > 0
      ? `${lockedCount} ${lockedCount === 1 ? 'passage is' : 'passages are'} ` +
        `locked until you upgrade`
      : 'extra passages lock until you upgrade';
  return (
    `Nothing was deleted — all your music is right where you left it. ` +
    `Your first ${FREE_PASSAGE_LIMIT} passages stay free to practice; ${locked}. ` +
    `Pick up Pro anytime and everything unlocks instantly.`
  );
}

// The short stamp on a locked card, and the line the paywall shows when a
// locked item is tapped.
export const LOCK_BADGE_LABEL = 'Locked';
export function lockedContextLine(): string {
  return `This one's locked on the free plan — your first ${FREE_PASSAGE_LIMIT} passages stay free. Unlock everything with Pro:`;
}
export const LOCKED_PDF_CONTEXT_LINE =
  'Full PDF parts are a Practice Pro feature. Your file is safe — upgrade to open it:';
