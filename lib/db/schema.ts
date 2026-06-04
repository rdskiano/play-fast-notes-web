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
];
