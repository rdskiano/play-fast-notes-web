-- Sync Phase 3 groundwork (cloud side) — REQUIRES RALPH'S EXPLICIT APPROVAL
-- before running against the live project (uugodzwxuxgfwujnwpuq).
--
-- Purely additive: document_annotations (per-PDF-page pencil marks) gains the
-- same server-stamped pull watermark every other synced table got in
-- 2026-08-15-sync-groundwork.sql (which IS already applied — verified live).
-- Nothing is dropped or modified; web keeps working unchanged.
--
-- Until this runs, the iPad engine pushes annotation changes fine but skips
-- PULLING document-page annotations (it probes for server_updated_at and
-- quietly waits) — so web-drawn PDF marks reach the iPad only after this.

alter table document_annotations
  add column if not exists server_updated_at timestamptz not null default now();

-- touch_server_updated_at() already exists (created by the Phase 1/2 groundwork).
drop trigger if exists trg_sua_document_annotations on document_annotations;
create trigger trg_sua_document_annotations before update on document_annotations
  for each row execute function touch_server_updated_at();

create index if not exists idx_docann_sua
  on document_annotations(user_id, server_updated_at);
