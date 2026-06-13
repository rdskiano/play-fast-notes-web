// Central switchboard for the paid tier ("Practice Pro").
//
// PAYWALL_ENABLED is the master switch. While false, every account is
// treated as Pro and nothing is gated — the paywall code ships dark so it
// can be tested and then flipped on without a code change rush. Flip it to
// true only after: Stripe prices exist, the two edge functions have their
// secrets set, and FOUNDING_MEMBER_CUTOFF_MS is set to the flip moment.
export const PAYWALL_ENABLED = false;

// Accounts created before this instant get Pro free, forever ("Founding
// Member"). Set to the moment the paywall flips on; everyone who signed up
// while the app was free is grandfathered. 2026-06-13T00:00:00Z is a
// placeholder — update it on flip day.
export const FOUNDING_MEMBER_CUTOFF_MS = Date.UTC(2026, 5, 13);

// New accounts get full Pro for this long before the free tier applies.
export const TRIAL_DAYS = 14;

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
  'Unlimited passages and folders',
  'Full PDF parts — page turns, pencil, foot pedal',
  'Every practice strategy on all of them',
  'Supports a musician-built indie app',
] as const;
