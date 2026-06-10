import { getDb } from '../client';

export type Strategy =
  | 'tempo_ladder'
  | 'click_up'
  | 'rhythmic'
  | 'chunking'
  | 'micro_chaining'
  | 'macro_chaining'
  | 'interleaved';

export type Exercise = {
  id: string;
  piece_id: string;
  strategy: Strategy;
  config_json: string;
  name: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

function newId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getOrCreateExercise(
  piece_id: string,
  strategy: Strategy,
): Promise<Exercise> {
  const db = getDb();
  const existing = await db.getFirstAsync<Exercise>(
    `SELECT * FROM exercises WHERE piece_id = ? AND strategy = ? AND deleted_at IS NULL LIMIT 1;`,
    piece_id,
    strategy,
  );
  if (existing) return existing;
  const id = `${piece_id}:${strategy}`;
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO exercises (id, piece_id, strategy, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    id,
    piece_id,
    strategy,
    '{}',
    now,
    now,
  );
  return {
    id,
    piece_id,
    strategy,
    config_json: '{}',
    name: null,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

export async function insertExercise(
  piece_id: string,
  strategy: Strategy,
  name: string | null,
  config_json: string,
): Promise<Exercise> {
  const db = getDb();
  const row = await db.getFirstAsync<{ max_order: number | null }>(
    `SELECT MAX(sort_order) AS max_order FROM exercises
     WHERE piece_id = ? AND strategy = ? AND deleted_at IS NULL;`,
    piece_id,
    strategy,
  );
  const sort_order = (row?.max_order ?? -1) + 1;
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO exercises (id, piece_id, strategy, config_json, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    id,
    piece_id,
    strategy,
    config_json,
    name,
    sort_order,
    now,
    now,
  );
  return {
    id,
    piece_id,
    strategy,
    config_json,
    name,
    sort_order,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const db = getDb();
  const row = await db.getFirstAsync<Exercise>(
    `SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL LIMIT 1;`,
    id,
  );
  return row ?? null;
}

export async function listExercisesForPassage(
  piece_id: string,
  strategy?: Strategy,
): Promise<Exercise[]> {
  const db = getDb();
  if (strategy) {
    return db.getAllAsync<Exercise>(
      `SELECT * FROM exercises
       WHERE piece_id = ? AND strategy = ? AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC;`,
      piece_id,
      strategy,
    );
  }
  return db.getAllAsync<Exercise>(
    `SELECT * FROM exercises
     WHERE piece_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC;`,
    piece_id,
  );
}

export async function updateExerciseConfig(
  id: string,
  config_json: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE exercises SET config_json = ?, updated_at = ? WHERE id = ?;`,
    config_json,
    Date.now(),
    id,
  );
}

export async function renameExercise(id: string, name: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE exercises SET name = ?, updated_at = ? WHERE id = ?;`,
    name,
    Date.now(),
    id,
  );
}

export async function updateExerciseSortOrder(
  id: string,
  sort_order: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE exercises SET sort_order = ? WHERE id = ?;`,
    sort_order,
    id,
  );
}

export async function softDeleteExercise(id: string): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    `UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ?;`,
    now,
    now,
    id,
  );
}
