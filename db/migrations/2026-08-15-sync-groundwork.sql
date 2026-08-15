-- Sync groundwork (cloud side) — REQUIRES RALPH'S EXPLICIT APPROVAL before
-- running against the live project (uugodzwxuxgfwujnwpuq). Purely additive:
-- no data is modified beyond backfilling the two new practice_log columns,
-- nothing is dropped, and the live web app keeps working unchanged while
-- this is applied. Apply BEFORE deploying the web build that writes
-- practice_log.updated_at/deleted_at, and before the iPad build with the
-- sync engine can do anything (it probes for server_updated_at and stays
-- dormant until this exists).

-- 1. practice_log grows the same edit/delete bookkeeping every other synced
--    table already has. updated_at backfills to practiced_at (a session's
--    "last change" starts as the moment it was played).
alter table practice_log add column if not exists updated_at bigint;
alter table practice_log add column if not exists deleted_at bigint;
update practice_log set updated_at = practiced_at where updated_at is null;

-- 2. server_updated_at: the pull watermark. Stamped by the SERVER on every
--    insert/update so device clocks can't corrupt "what changed since I last
--    looked". Distinct from updated_at (client-stamped, powers newest-wins).
create or replace function touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

alter table folders               add column if not exists server_updated_at timestamptz not null default now();
alter table documents             add column if not exists server_updated_at timestamptz not null default now();
alter table pieces                add column if not exists server_updated_at timestamptz not null default now();
alter table exercises             add column if not exists server_updated_at timestamptz not null default now();
alter table practice_log          add column if not exists server_updated_at timestamptz not null default now();
alter table tempo_ladder_progress add column if not exists server_updated_at timestamptz not null default now();
alter table click_up_progress     add column if not exists server_updated_at timestamptz not null default now();
alter table strategy_last_used    add column if not exists server_updated_at timestamptz not null default now();

drop trigger if exists trg_sua_folders on folders;
create trigger trg_sua_folders before update on folders
  for each row execute function touch_server_updated_at();
drop trigger if exists trg_sua_documents on documents;
create trigger trg_sua_documents before update on documents
  for each row execute function touch_server_updated_at();
drop trigger if exists trg_sua_pieces on pieces;
create trigger trg_sua_pieces before update on pieces
  for each row execute function touch_server_updated_at();
drop trigger if exists trg_sua_exercises on exercises;
create trigger trg_sua_exercises before update on exercises
  for each row execute function touch_server_updated_at();
drop trigger if exists trg_sua_practice_log on practice_log;
create trigger trg_sua_practice_log before update on practice_log
  for each row execute function touch_server_updated_at();
drop trigger if exists trg_sua_tlp on tempo_ladder_progress;
create trigger trg_sua_tlp before update on tempo_ladder_progress
  for each row execute function touch_server_updated_at();
drop trigger if exists trg_sua_cup on click_up_progress;
create trigger trg_sua_cup before update on click_up_progress
  for each row execute function touch_server_updated_at();
drop trigger if exists trg_sua_slu on strategy_last_used;
create trigger trg_sua_slu before update on strategy_last_used
  for each row execute function touch_server_updated_at();

-- 3. Pull-query indexes: each device asks "my rows changed since <watermark>",
--    ordered by server_updated_at.
create index if not exists idx_folders_sua on folders(user_id, server_updated_at);
create index if not exists idx_documents_sua on documents(user_id, server_updated_at);
create index if not exists idx_pieces_sua on pieces(user_id, server_updated_at);
create index if not exists idx_exercises_sua on exercises(user_id, server_updated_at);
create index if not exists idx_practice_log_sua on practice_log(user_id, server_updated_at);
create index if not exists idx_tlp_sua on tempo_ladder_progress(user_id, server_updated_at);
create index if not exists idx_cup_sua on click_up_progress(user_id, server_updated_at);
create index if not exists idx_slu_sua on strategy_last_used(user_id, server_updated_at);
