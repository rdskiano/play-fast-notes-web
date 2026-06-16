-- Play Fast Notes — web schema
-- Paste this into the Supabase SQL editor (one-time).
-- Mirrors the iPad SQLite schema in learn-fast-notes/lib/db/schema.ts,
-- with user_id + Row Level Security added so each authenticated user
-- only sees their own rows.

-- folders (must come before pieces, since pieces references it)
create table if not exists folders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  parent_folder_id text references folders(id),
  sort_order integer default 0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint
);
create index if not exists idx_folders_parent on folders(parent_folder_id);
alter table folders enable row level security;
create policy folders_owner_all on folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- pieces
create table if not exists pieces (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  composer text,
  source_kind text not null check (source_kind in ('pdf', 'image')),
  source_uri text not null,
  thumbnail_uri text,
  -- The full, uncropped photo a passage was first created from. Cropping a
  -- photo passage writes the crop to source_uri but preserves the original
  -- here, so the user can always re-open Crop on the full image (re-frame
  -- wider/narrower) or crop a second passage from the same photo.
  original_uri text,
  units_json text,
  folder_id text references folders(id),
  sort_order integer default 0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint
);
create index if not exists idx_pieces_folder on pieces(folder_id);
-- Migration for existing deployments (added 2026-06-15): preserve the full
-- photo so cropping is non-destructive. Safe to run repeatedly.
alter table pieces add column if not exists original_uri text;
alter table pieces enable row level security;
create policy pieces_owner_all on pieces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exercises
create table if not exists exercises (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  piece_id text not null references pieces(id),
  strategy text not null check (strategy in ('tempo_ladder', 'click_up', 'rhythmic', 'chunking', 'micro_chaining', 'macro_chaining')),
  config_json text not null default '{}',
  name text,
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint
);
create index if not exists idx_exercises_piece on exercises(piece_id);
alter table exercises enable row level security;
create policy exercises_owner_all on exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- practice_log (auto-incrementing id)
create table if not exists practice_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  piece_id text not null,
  strategy text not null,
  practiced_at bigint not null,
  data_json text,
  exercise_id text
);
create index if not exists idx_practice_log_piece on practice_log(piece_id);
create index if not exists idx_practice_log_date on practice_log(practiced_at);
create index if not exists idx_practice_log_exercise on practice_log(exercise_id);
alter table practice_log enable row level security;
create policy practice_log_owner_all on practice_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- click_up_progress
create table if not exists click_up_progress (
  exercise_id text primary key references exercises(id),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  current_index integer not null default 0,
  updated_at bigint not null
);
alter table click_up_progress enable row level security;
create policy click_up_owner_all on click_up_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tempo_ladder_progress
create table if not exists tempo_ladder_progress (
  exercise_id text primary key references exercises(id),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  mode text not null check (mode in ('step', 'cluster')),
  start_tempo integer not null,
  goal_tempo integer not null,
  increment integer,
  cluster_low integer,
  cluster_high integer,
  target_reps integer not null,
  goal_date bigint,
  current_tempo integer not null,
  current_streak integer not null default 0,
  updated_at bigint not null
);
alter table tempo_ladder_progress enable row level security;
create policy tempo_ladder_owner_all on tempo_ladder_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- strategy_last_used
create table if not exists strategy_last_used (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  piece_id text not null references pieces(id),
  strategy text not null,
  last_used_at bigint not null,
  primary key (user_id, piece_id, strategy)
);
create index if not exists idx_strategy_last_used_piece on strategy_last_used(piece_id, strategy);
alter table strategy_last_used enable row level security;
create policy strategy_last_used_owner_all on strategy_last_used
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- settings (per-user key/value)
create table if not exists settings (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key text not null,
  value_json text not null,
  primary key (user_id, key)
);
alter table settings enable row level security;
create policy settings_owner_all on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- subscriptions: source of truth for paid + comp access tier.
--
-- Schema is intentionally minimal until Stripe ships. Until then, the
-- only thing the client (useSubscription) cares about is whether the
-- user has an active non-free tier. Granting comp access is a manual
-- admin operation in Supabase Studio:
--
--   To grant one year of free access to a friend, paste this in SQL
--   editor (replace <friend-user-uuid> with the row from auth.users):
--
--     insert into subscriptions (user_id, tier, status, current_period_end)
--     values (
--       '<friend-user-uuid>',
--       'comp',
--       'active',
--       (extract(epoch from now() + interval '1 year') * 1000)::bigint
--     )
--     on conflict (user_id) do update
--       set tier = excluded.tier,
--           status = excluded.status,
--           current_period_end = excluded.current_period_end,
--           updated_at = (extract(epoch from now()) * 1000)::bigint;
--
-- The client treats tier=comp/pro + status=active + expiry-in-future as
-- "active free access". Expired rows fall back to free with no cleanup
-- needed — the row stays, the client just stops counting it.
create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text,
  status text,
  stripe_customer_id text,
  current_period_end bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table subscriptions enable row level security;
create policy subscriptions_owner_select on subscriptions
  for select using (auth.uid() = user_id);

-- documents (Phase 1 of the documents+passages plan — a parent of passages
-- when a passage is marked inside a multi-page PDF or image set)
create table if not exists documents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  composer text,
  source_kind text not null check (source_kind in ('pdf', 'images')),
  original_uri text,
  page_count integer not null,
  pages_json text not null,
  folder_id text references folders(id),
  sort_order integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint
);
create index if not exists idx_documents_folder on documents(folder_id);
alter table documents enable row level security;
create policy documents_owner_all on documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- additive columns on pieces — null = standalone passage (the existing flow,
-- unchanged); non-null document_id = passage marked inside a document.
-- regions_json holds [{page, x, y, w, h}, ...] in source-page pixel space.
alter table pieces add column if not exists document_id text references documents(id);
alter table pieces add column if not exists regions_json text;
create index if not exists idx_pieces_document on pieces(document_id);

-- documents.sections_json: optional per-document list of named page-range
-- sections, e.g. movements of a symphony part. Drives the practice log
-- grouping ("Mahler 9 - IV. Adagio - bars 281-291") and section-jump nav.
alter table documents add column if not exists sections_json text;

-- ─────────────────────────────────────────────────────────────────────
-- custom_patterns (Tempo Ladder Custom mode)
-- Per-user library of named "N reps at tempo X" patterns. Each pattern
-- is a list of blocks; one execution of the whole pattern with no misses
-- counts as a clean set and bumps the base tempo by the exercise's
-- increment. Patterns are user-scoped (one library per user) and show up
-- alongside Step click-up + Randomized cluster in the mode picker.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists custom_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  blocks jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_custom_patterns_user on custom_patterns(user_id, sort_order);
alter table custom_patterns enable row level security;
create policy custom_patterns_owner_all on custom_patterns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tempo_ladder_progress additions for Custom mode.
-- The existing CHECK on `mode` only allows 'step' or 'cluster'; drop and
-- re-add so 'custom' is permitted. The new columns track which pattern is
-- selected for this exercise plus the live position inside it (which block,
-- which rep within the block). Null in step/cluster mode.
alter table tempo_ladder_progress drop constraint if exists tempo_ladder_progress_mode_check;
alter table tempo_ladder_progress add constraint tempo_ladder_progress_mode_check
  check (mode in ('step', 'cluster', 'custom'));
alter table tempo_ladder_progress add column if not exists custom_pattern_id uuid
  references custom_patterns(id) on delete set null;
alter table tempo_ladder_progress add column if not exists custom_block_index integer;
alter table tempo_ladder_progress add column if not exists custom_rep_in_block integer;

-- Micro-Chaining + Macro-Chaining strategies. Widen the exercises.strategy
-- CHECK to permit the two new step-based methods. Their per-exercise config
-- (note/beat marks + mode + tempo) lives in exercises.config_json and their
-- step index reuses click_up_progress, so no new tables are needed.
-- practice_log.strategy is free text (no CHECK), so logging needs no change.
alter table exercises drop constraint if exists exercises_strategy_check;
alter table exercises add constraint exercises_strategy_check
  check (strategy in ('tempo_ladder', 'click_up', 'rhythmic', 'chunking', 'micro_chaining', 'macro_chaining'));

-- Community Rhythm Library (Phase 1). A browsable, searchable shelf of
-- rhythm-builder exercises: free to read (the funnel), Pro to publish. Stores
-- a COPY of the exercise config_json (never an uploaded file — the app
-- generates the artifact, so only the contributor's own notation is ever
-- shared, no copyrighted scans). Web/cloud only; native reaches it via the
-- web Supabase client like recordings, so no SQLite mirror.
create table if not exists community_exercises (
  id uuid primary key default gen_random_uuid(),
  contributor_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  contributor_name text not null,
  title text not null,
  config_json jsonb not null,
  instrument_id text,
  repertoire_type text,
  piece_title text,
  composer text,
  time_signature text,
  notes text,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_community_exercises_instrument on community_exercises(instrument_id);
create index if not exists idx_community_exercises_reptype on community_exercises(repertoire_type);
alter table community_exercises enable row level security;
-- Anyone signed in may READ (browsing is free — the funnel).
drop policy if exists community_exercises_read on community_exercises;
create policy community_exercises_read on community_exercises for select using (true);
-- Only the contributor may write/edit/remove their own rows (publish is
-- Pro-gated in the app UI before this insert ever runs).
drop policy if exists community_exercises_owner_write on community_exercises;
create policy community_exercises_owner_write on community_exercises
  for all using (auth.uid() = contributor_user_id) with check (auth.uid() = contributor_user_id);

-- Let a non-owner bump download_count without write access to the row.
create or replace function increment_community_download(ex_id uuid)
returns void language sql security definer set search_path = public as $$
  update community_exercises set download_count = download_count + 1 where id = ex_id;
$$;
