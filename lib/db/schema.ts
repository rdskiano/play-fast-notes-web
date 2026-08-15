export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS pieces (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    composer TEXT,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('pdf', 'image')),
    source_uri TEXT NOT NULL,
    thumbnail_uri TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY NOT NULL,
    piece_id TEXT NOT NULL REFERENCES pieces(id),
    strategy TEXT NOT NULL CHECK (strategy IN ('tempo_ladder', 'click_up', 'rhythmic', 'chunking')),
    config_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_exercises_piece ON exercises(piece_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_exercise ON sessions(exercise_id);

  CREATE TABLE IF NOT EXISTS tempo_ladder_progress (
    exercise_id TEXT PRIMARY KEY NOT NULL REFERENCES exercises(id),
    mode TEXT NOT NULL CHECK (mode IN ('step', 'cluster')),
    start_tempo INTEGER NOT NULL,
    goal_tempo INTEGER NOT NULL,
    increment INTEGER,
    cluster_low INTEGER,
    cluster_high INTEGER,
    target_reps INTEGER NOT NULL,
    goal_date INTEGER,
    current_tempo INTEGER NOT NULL,
    current_streak INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS click_up_progress (
    exercise_id TEXT PRIMARY KEY NOT NULL REFERENCES exercises(id),
    current_index INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS strategy_last_used (
    piece_id TEXT NOT NULL REFERENCES pieces(id),
    strategy TEXT NOT NULL,
    last_used_at INTEGER NOT NULL,
    PRIMARY KEY (piece_id, strategy)
  );
  CREATE INDEX IF NOT EXISTS idx_strategy_last_used_piece ON strategy_last_used(piece_id, strategy);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE pieces ADD COLUMN units_json TEXT;
  `,
  `
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    parent_folder_id TEXT REFERENCES folders(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id);
  ALTER TABLE pieces ADD COLUMN folder_id TEXT REFERENCES folders(id);
  CREATE INDEX IF NOT EXISTS idx_pieces_folder ON pieces(folder_id);
  `,
  `
  ALTER TABLE pieces ADD COLUMN sort_order INTEGER DEFAULT 0;
  ALTER TABLE folders ADD COLUMN sort_order INTEGER DEFAULT 0;
  `,
  `
  CREATE TABLE IF NOT EXISTS practice_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    piece_id TEXT NOT NULL,
    strategy TEXT NOT NULL,
    practiced_at INTEGER NOT NULL,
    data_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_practice_log_piece ON practice_log(piece_id);
  CREATE INDEX IF NOT EXISTS idx_practice_log_date ON practice_log(practiced_at);
  `,
  `
  ALTER TABLE exercises ADD COLUMN name TEXT;
  ALTER TABLE exercises ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  `,
  `
  ALTER TABLE practice_log ADD COLUMN exercise_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_practice_log_exercise ON practice_log(exercise_id);
  `,
  `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    composer TEXT,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('pdf', 'images')),
    original_uri TEXT,
    page_count INTEGER NOT NULL,
    pages_json TEXT NOT NULL,
    folder_id TEXT REFERENCES folders(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
  ALTER TABLE pieces ADD COLUMN document_id TEXT REFERENCES documents(id);
  ALTER TABLE pieces ADD COLUMN regions_json TEXT;
  CREATE INDEX IF NOT EXISTS idx_pieces_document ON pieces(document_id);
  `,
  `
  ALTER TABLE documents ADD COLUMN sections_json TEXT;
  `,
  `
  -- Tempo Ladder Custom mode. Patterns live in Supabase only (per-user library
  -- read straight from the cloud), but the progress row needs the three new
  -- position columns so the iPad can resume a Custom session. SQLite doesn't
  -- support dropping a CHECK constraint inline; the iPad's mode column is
  -- already untyped enough (TEXT) that an out-of-range value won't be a
  -- runtime issue, but a clean rebuild is the safest move for the CHECK
  -- update — copy data through a temp table.
  CREATE TABLE tempo_ladder_progress_new (
    exercise_id TEXT PRIMARY KEY NOT NULL REFERENCES exercises(id),
    mode TEXT NOT NULL CHECK (mode IN ('step', 'cluster', 'custom')),
    start_tempo INTEGER NOT NULL,
    goal_tempo INTEGER NOT NULL,
    increment INTEGER,
    cluster_low INTEGER,
    cluster_high INTEGER,
    target_reps INTEGER NOT NULL,
    goal_date INTEGER,
    custom_pattern_id TEXT,
    custom_block_index INTEGER,
    custom_rep_in_block INTEGER,
    current_tempo INTEGER NOT NULL,
    current_streak INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  INSERT INTO tempo_ladder_progress_new
    (exercise_id, mode, start_tempo, goal_tempo, increment, cluster_low, cluster_high, target_reps, goal_date, current_tempo, current_streak, updated_at)
  SELECT exercise_id, mode, start_tempo, goal_tempo, increment, cluster_low, cluster_high, target_reps, goal_date, current_tempo, current_streak, updated_at
  FROM tempo_ladder_progress;
  DROP TABLE tempo_ladder_progress;
  ALTER TABLE tempo_ladder_progress_new RENAME TO tempo_ladder_progress;
  `,
  `
  -- Match columns the web/Supabase side gained so /import-supabase brings the
  -- full row. Without these the per-row INSERT hit "no such column" and the
  -- WHOLE table failed to import: pieces.annotation_* meant passages (and their
  -- on-PDF boxes) never imported; practice_log.document_id meant practice
  -- history never imported.
  ALTER TABLE pieces ADD COLUMN annotation_data TEXT;
  ALTER TABLE pieces ADD COLUMN annotation_image_uri TEXT;
  ALTER TABLE practice_log ADD COLUMN document_id TEXT;
  `,
  `
  -- Micro-Chaining + Macro-Chaining strategies. SQLite can't ALTER a CHECK
  -- constraint inline, so rebuild the exercises table with the widened set —
  -- same copy-through-a-temp-table dance used for tempo_ladder_progress above.
  -- Foreign keys are not enforced on this connection (no PRAGMA foreign_keys),
  -- so dropping the parent table is safe even though sessions / *_progress
  -- reference exercises(id).
  CREATE TABLE exercises_new (
    id TEXT PRIMARY KEY NOT NULL,
    piece_id TEXT NOT NULL REFERENCES pieces(id),
    strategy TEXT NOT NULL CHECK (strategy IN ('tempo_ladder', 'click_up', 'rhythmic', 'chunking', 'micro_chaining', 'macro_chaining')),
    config_json TEXT NOT NULL,
    name TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  INSERT INTO exercises_new
    (id, piece_id, strategy, config_json, name, sort_order, created_at, updated_at, deleted_at)
  SELECT id, piece_id, strategy, config_json, name, sort_order, created_at, updated_at, deleted_at
  FROM exercises;
  DROP TABLE exercises;
  ALTER TABLE exercises_new RENAME TO exercises;
  CREATE INDEX IF NOT EXISTS idx_exercises_piece ON exercises(piece_id);
  `,
  `
  -- Preserve the full, uncropped photo so cropping a photo passage is
  -- non-destructive: the crop goes to source_uri, the original stays here, and
  -- Crop can always re-open the full image (re-frame, or crop another passage).
  ALTER TABLE pieces ADD COLUMN original_uri TEXT;
  `,
  `
  -- Per-piece due date (epoch ms) for the practice coach's urgency read.
  -- NULL = never asked; 0 = explicitly "no deadline"; >0 = a date.
  ALTER TABLE pieces ADD COLUMN due_date INTEGER;
  `,
  `
  -- User-chosen folder color. Stores a palette KEY (e.g. 'petrol', 'green'),
  -- not a hex, so it stays theme-consistent. NULL = auto color by position.
  ALTER TABLE folders ADD COLUMN color TEXT;
  `,
  `
  -- Per-piece performance (goal) tempo shared across strategies (B-013).
  -- Tempo Ladder + Click-Up prefill from it when they have no saved config of
  -- their own, and write it back when a session starts. NULL = never set.
  ALTER TABLE pieces ADD COLUMN performance_tempo INTEGER;
  `,
  `
  -- When a pencil annotation was last saved ON THIS DEVICE (epoch ms). Once
  -- set, the local annotation_data/annotation_image_uri are the source of
  -- truth for this passage and win over Supabase reads — iPad-created
  -- passages have no Supabase pieces row at all, and an offline save must not
  -- be shadowed by an older or empty cloud row. NULL = never drawn natively
  -- (imported/web-synced passages keep reading from Supabase).
  ALTER TABLE pieces ADD COLUMN annotation_saved_at INTEGER;
  `,
  `
  -- ── Sync groundwork (SYNC_PLAN Phase 1) ──────────────────────────────
  -- practice_log keeps its local INTEGER id (UI identity, untouched) and
  -- gains sync_id: a client-minted, globally-unique text id matching the
  -- cloud's practice_log.client_id — the cross-device identity of a session.
  -- updated_at/deleted_at let edits + deletions travel; deletes are
  -- tombstones from now on.
  ALTER TABLE practice_log ADD COLUMN sync_id TEXT;
  ALTER TABLE practice_log ADD COLUMN updated_at INTEGER;
  ALTER TABLE practice_log ADD COLUMN deleted_at INTEGER;
  UPDATE practice_log
     SET sync_id = 'lg_' || id || '_' || lower(hex(randomblob(6))),
         updated_at = practiced_at
   WHERE sync_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_log_sync_id ON practice_log(sync_id);

  -- Sync bookkeeping. sync_ctl.applying is a guard raised while cloud rows
  -- are being written locally (engine pull, /import-supabase) so they don't
  -- echo back into the outbox. sync_state holds watermarks + flags.
  -- sync_outbox is the change log: one row per dirty (table, row).
  CREATE TABLE IF NOT EXISTS sync_ctl (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    applying INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO sync_ctl (id, applying) VALUES (1, 0);
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_outbox (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    queued_at INTEGER NOT NULL,
    PRIMARY KEY (table_name, row_id)
  );

  -- Change-capture triggers: every INSERT/UPDATE on a synced table queues
  -- the row for push, so repos never have to remember to enqueue. No DELETE
  -- triggers on purpose — real deletes are local housekeeping (the import
  -- wipe) and must never push a deletion; only deleted_at tombstones travel.
  CREATE TRIGGER IF NOT EXISTS trg_sync_pieces_i AFTER INSERT ON pieces
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('pieces', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_pieces_u AFTER UPDATE ON pieces
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('pieces', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_folders_i AFTER INSERT ON folders
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('folders', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_folders_u AFTER UPDATE ON folders
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('folders', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_documents_i AFTER INSERT ON documents
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('documents', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_documents_u AFTER UPDATE ON documents
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('documents', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_exercises_i AFTER INSERT ON exercises
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('exercises', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_exercises_u AFTER UPDATE ON exercises
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('exercises', NEW.id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_practice_log_i AFTER INSERT ON practice_log
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0 AND NEW.sync_id IS NOT NULL
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('practice_log', NEW.sync_id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_practice_log_u AFTER UPDATE ON practice_log
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0 AND NEW.sync_id IS NOT NULL
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('practice_log', NEW.sync_id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_tlp_i AFTER INSERT ON tempo_ladder_progress
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('tempo_ladder_progress', NEW.exercise_id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_tlp_u AFTER UPDATE ON tempo_ladder_progress
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('tempo_ladder_progress', NEW.exercise_id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_cup_i AFTER INSERT ON click_up_progress
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('click_up_progress', NEW.exercise_id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_cup_u AFTER UPDATE ON click_up_progress
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('click_up_progress', NEW.exercise_id, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_slu_i AFTER INSERT ON strategy_last_used
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('strategy_last_used', NEW.piece_id || '|' || NEW.strategy, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;
  CREATE TRIGGER IF NOT EXISTS trg_sync_slu_u AFTER UPDATE ON strategy_last_used
    WHEN (SELECT applying FROM sync_ctl WHERE id = 1) = 0
  BEGIN
    INSERT INTO sync_outbox (table_name, row_id, queued_at)
    VALUES ('strategy_last_used', NEW.piece_id || '|' || NEW.strategy, strftime('%s','now') * 1000)
    ON CONFLICT (table_name, row_id) DO UPDATE SET queued_at = excluded.queued_at;
  END;

  -- Seed the outbox with everything LIVE on this device: the first sync
  -- pushes the whole local library up, which is the point — nothing on the
  -- iPad should exist only on the iPad. Rows the cloud already has are
  -- skipped by the engine's "cloud is at least as new" check, so the seed
  -- costs one metadata pass, not a re-upload. Every SELECT here carries a
  -- WHERE clause — SQLite refuses to parse INSERT..SELECT..ON CONFLICT
  -- without one (the "upsert-from-select" rule), and that parse error once
  -- silently killed this whole seed block.
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'folders', id, strftime('%s','now') * 1000 FROM folders WHERE deleted_at IS NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'documents', id, strftime('%s','now') * 1000 FROM documents WHERE deleted_at IS NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'pieces', id, strftime('%s','now') * 1000 FROM pieces WHERE deleted_at IS NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'exercises', id, strftime('%s','now') * 1000 FROM exercises WHERE deleted_at IS NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'practice_log', sync_id, strftime('%s','now') * 1000 FROM practice_log WHERE sync_id IS NOT NULL AND deleted_at IS NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'tempo_ladder_progress', exercise_id, strftime('%s','now') * 1000 FROM tempo_ladder_progress WHERE exercise_id IS NOT NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'click_up_progress', exercise_id, strftime('%s','now') * 1000 FROM click_up_progress WHERE exercise_id IS NOT NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  INSERT INTO sync_outbox (table_name, row_id, queued_at)
    SELECT 'strategy_last_used', piece_id || '|' || strategy, strftime('%s','now') * 1000 FROM strategy_last_used WHERE piece_id IS NOT NULL
  ON CONFLICT (table_name, row_id) DO NOTHING;
  `,
];
