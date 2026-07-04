-- Founders forever — run ONCE at the one-time-pricing announcement (Phase 3).
-- Extends every dated comp grant to the lifetime sentinel so the founding-user
-- promise ("everything you have is yours, free, forever") is literally true.
--
-- As of 2026-07-03: 77 comp rows, 7 already lifetime, 70 dated ~2026-12.
-- Safe to re-run (idempotent); touches only active comp rows that would
-- otherwise expire. Does NOT touch 'pro' (purchased) rows.
--
-- 4102444800000 = 2100-01-01 UTC, past the app's LIFETIME_AFTER_MS (~2096)
-- so the account screen shows "free, on the house" instead of a date.

update subscriptions
set current_period_end = 4102444800000,
    updated_at = (extract(epoch from now()) * 1000)::bigint
where tier = 'comp'
  and status = 'active'
  and current_period_end < 4102444800000;
