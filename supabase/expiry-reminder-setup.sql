-- expiry-reminder setup — APPLIED to the live project 2026-07-04. Kept as the
-- record of what exists; re-running is harmless (table is idempotent; the
-- cron.schedule call would error on the duplicate job name — unschedule first).
--
-- Part 1 (applied as migration expiry_reminders_setup): extensions + dedupe
-- table. One row per (user, expiry) reminder actually sent. Service-role
-- only — RLS on with no policies blocks all client access.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists expiry_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at bigint not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, expires_at)
);
alter table expiry_reminders enable row level security;

-- Part 2 (applied 2026-07-04): daily schedule at 13:00 UTC (~9am Detroit).
-- The shared secret is NOT inlined here — it lives encrypted in Supabase
-- Vault under the name 'expiry_cron_secret' (same value as the edge-function
-- secret CRON_SECRET), and the job reads it at run time. If the secret ever
-- rotates, update BOTH places: the Vault row and the function secret.

select cron.schedule(
  'expiry-reminder-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://uugodzwxuxgfwujnwpuq.supabase.co/functions/v1/expiry-reminder',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'expiry_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Undo: select cron.unschedule('expiry-reminder-daily');
-- Manual test send (Ralph only): POST {"test":true} to the function with the
-- x-cron-secret header — sends one sample to rdskiano@gmail.com, touches nothing.
