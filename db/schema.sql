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
  units_json text,
  folder_id text references folders(id),
  sort_order integer default 0,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint
);
create index if not exists idx_pieces_folder on pieces(folder_id);
alter table pieces enable row level security;
create policy pieces_owner_all on pieces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exercises
create table if not exists exercises (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  piece_id text not null references pieces(id),
  strategy text not null check (strategy in ('tempo_ladder', 'click_up', 'rhythmic', 'chunking')),
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

-- subscriptions (future-proofing for Phase 4.4 of the roadmap;
-- empty until Stripe integration ships)
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
