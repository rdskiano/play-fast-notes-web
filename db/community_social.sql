-- Community social signals: private bookmarks + public upvotes for shared
-- exercises. Run once in the Supabase SQL editor. Additive and safe for the
-- live app (new tables only; nothing existing is touched). Until this runs,
-- the Community screen's bookmark/upvote controls render but no-op (the loads
-- are best-effort and treat missing tables as empty).

-- Private bookmarks (a personal "saved" list; RLS keeps each user to their own).
create table if not exists community_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  exercise_id uuid not null references community_exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
alter table community_bookmarks enable row level security;
create policy community_bookmarks_owner_all on community_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_community_bookmarks_user on community_bookmarks(user_id);

-- Public upvotes (everyone can read the counts; a user may cast/withdraw only
-- their own vote — one per exercise via the composite primary key).
create table if not exists community_votes (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  exercise_id uuid not null references community_exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
alter table community_votes enable row level security;
create policy community_votes_read on community_votes
  for select using (true);
create policy community_votes_insert on community_votes
  for insert with check (auth.uid() = user_id);
create policy community_votes_delete on community_votes
  for delete using (auth.uid() = user_id);
create index if not exists idx_community_votes_exercise on community_votes(exercise_id);
