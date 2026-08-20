-- One-time migration for Apple In-App Purchase (2026-08).
-- Run in Supabase Studio SQL editor (or apply_migration) BEFORE deploying the
-- verify-apple-purchase edge function — the function writes the new column.
--
-- apple_original_transaction_id records which Apple purchase unlocked the
-- account (the Stripe path leaves it null). The partial unique index is the
-- anti-abuse rule: one Apple purchase can unlock exactly one account.

alter table subscriptions
  add column if not exists apple_original_transaction_id text;

create unique index if not exists idx_subscriptions_apple_otx
  on subscriptions(apple_original_transaction_id)
  where apple_original_transaction_id is not null;
