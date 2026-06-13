// Central switchboard for the paid tier ("Practice Pro").
//
// Model:
//   • Every NEW account gets a 30-day full-Pro trial (no card), then drops
//     to the free tier unless they subscribe.
//   • The 64 users who were here before launch get 6 months free, granted as
//     'comp' subscription rows at flip time (their accounts are older than
//     30 days, so the trial alone wouldn't cover them). See the flip-day SQL
//     below.
//   • Beta testers get 6 months free via a shareable Stripe promotion code
//     (100% off, 6-month duration) entered at checkout — TESTER_PROMO_CODE.
//
// PAYWALL_ENABLED is the master switch. While false, every account reads as
// Pro and nothing is gated — the paywall ships dark so it can be tested and
// then flipped without a code-change scramble. Flip to true only after:
// Stripe prices + the BETA6 promo code exist, both edge functions have their
// secrets, and the existing-user comp grant below has been run.
export const PAYWALL_ENABLED = false;

// New accounts get full Pro for this long before the free tier applies.
export const TRIAL_DAYS = 30;

// Reward (months) for pre-launch users and beta testers. Pre-launch users are
// comped directly; testers redeem TESTER_PROMO_CODE at checkout. Both 6.
export const REWARD_MONTHS = 6;
export const TESTER_PROMO_CODE = 'BETA6';

// FLIP-DAY: grant every existing user 6 months free. Run ONCE in the Supabase
// SQL editor at the moment PAYWALL_ENABLED goes true:
//
//   insert into subscriptions (user_id, tier, status, current_period_end)
//   select id, 'comp', 'active',
//          (extract(epoch from now() + interval '6 months') * 1000)::bigint
//   from auth.users
//   on conflict (user_id) do update
//     set tier = 'comp', status = 'active',
//         current_period_end = excluded.current_period_end,
//         updated_at = (extract(epoch from now()) * 1000)::bigint;

// Free tier: this many active photo passages. PDF parts (documents) are
// Pro-only — they're the serious-player workflow and the real storage cost.
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
