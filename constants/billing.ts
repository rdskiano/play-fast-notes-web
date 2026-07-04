// Central switchboard for the paid tier ("Practice Pro").
//
// Model (revised 2026-07-03 — ONE-TIME PURCHASE, not a subscription):
//   • Every NEW account gets a 30-day full-Pro trial (no card), then drops
//     to the free tier unless they buy.
//   • Buying is a single $19.99 payment — the app is theirs forever. In the
//     database that's a subscriptions row with tier 'pro' and a far-future
//     current_period_end (the same lifetime sentinel the comp grants use),
//     so every existing "is this active?" read works unchanged.
//   • The 77 pre-pivot users keep their comp rows (7 lifetime, 70 dated).
//     Founding-user promise = extend the dated 70 to lifetime; the SQL for
//     that lives in supabase/comp-grants.sql territory (run at announcement).
//
// PAYWALL_ENABLED is the master switch. While false, every account reads as
// Pro and nothing is gated. It has been true (live) since 2026-06-26.
//
// ── ONE-TIME PIVOT RUNBOOK (do these in order) ──────────────────────────────
//   1. Stripe Dashboard → live mode: create a one-time price ($19.99,
//      "Play Fast Notes — full unlock"). Note the price_… id.
//   2. Supabase → Edge Functions → Secrets (dashboard; no MCP): set
//      STRIPE_PRICE_LIFETIME to that id. (STRIPE_SECRET_KEY and
//      STRIPE_WEBHOOK_SECRET are already set from the subscription era.)
//   3. Deploy the two updated edge functions (create-checkout-session,
//      stripe-webhook). The webhook now ignores subscription events, so
//      cancelling Ralph's leftover BETA6 test subscription in Stripe is safe
//      to do any time after this deploy.
//   4. Run the founders-forever SQL (extend the 70 dated comps to lifetime).
//   5. Deploy the app (`git push web-origin-archive master`) with this copy.
//   6. Smoke-test: fresh account → trial; free account → lock → $19.99
//      checkout (test mode first) → row flips to lifetime pro.
// Native checkout still throws (Apple IAP is Phase 2).
export const PAYWALL_ENABLED = true;

// New accounts get full Pro for this long before the free tier applies.
export const TRIAL_DAYS = 30;

// (Subscription-era exports REWARD_MONTHS / TESTER_PROMO_CODE retired with
// the one-time pivot: pre-pivot users are comped directly in the database,
// and promo codes don't apply to a one-time checkout.)

// "Lifetime" comp rows are granted with a far-future expiry (the 2099 sentinel).
// Anything dated past this counts as forever — the account screen then shows
// "on the house" instead of a literal (and ugly) far-future date.
export const LIFETIME_AFTER_MS = 4_000_000_000_000; // ~ year 2096
export function isLifetimeExpiry(expiresAtMs: number | null): boolean {
  return expiresAtMs != null && expiresAtMs > LIFETIME_AFTER_MS;
}

// COMP GRANTS — the flip-day grants ran 2026-06-26: all 77 pre-pivot users
// hold active comp rows (7 lifetime, 70 dated ~2026-12). The one-time pivot's
// founders-forever step extends those 70 to the lifetime sentinel (step 4 of
// the runbook above). Runnable SQL stays out of the repo — local only.

// Free tier: this many active photo passages — marked passages that aren't from
// a PDF (legacy standalone photos + passages marked on photo/image-documents),
// counted by countActivePhotoPassages(). PDF parts (source_kind 'pdf' documents)
// are Pro-only — the serious-player workflow and the real storage cost.
export const FREE_PASSAGE_LIMIT = 3;

// Display strings used by the paywall UI. The actual amount lives in the
// Stripe Dashboard price (STRIPE_PRICE_LIFETIME); keep in sync by hand.
export const PRICE_LIFETIME_LABEL = '$19.99';
export const PRICE_LIFETIME_SUBLABEL = 'one payment — yours forever';

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
    `${when} your free month wraps up. Keep everything for ${PRICE_LIFETIME_LABEL} — ` +
    `${PRICE_LIFETIME_SUBLABEL}, no subscription. ` +
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
