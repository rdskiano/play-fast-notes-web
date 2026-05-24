import { getDb } from '../client';

export type TempoLadderMode = 'step' | 'cluster' | 'custom';

export type TempoLadderConfig = {
  exercise_id: string;
  mode: TempoLadderMode;
  start_tempo: number;
  goal_tempo: number;
  increment?: number | null;
  cluster_low?: number | null;
  cluster_high?: number | null;
  target_reps: number;
  goal_date?: number | null;
  // Custom mode: which user pattern is selected, plus the live position
  // (which block + which rep within the block). Null in step/cluster mode.
  custom_pattern_id?: string | null;
  custom_block_index?: number | null;
  custom_rep_in_block?: number | null;
};

export type TempoLadderProgress = TempoLadderConfig & {
  current_tempo: number;
  current_streak: number;
  updated_at: number;
};

export async function upsertTempoLadder(cfg: TempoLadderConfig): Promise<TempoLadderProgress> {
  const db = getDb();
  const existing = await db.getFirstAsync<TempoLadderProgress>(
    `SELECT * FROM tempo_ladder_progress WHERE exercise_id = ?;`,
    cfg.exercise_id,
  );
  const now = Date.now();
  const current_tempo = existing?.current_tempo ?? cfg.start_tempo;
  const current_streak = existing?.current_streak ?? 0;
  await db.runAsync(
    `INSERT INTO tempo_ladder_progress
       (exercise_id, mode, start_tempo, goal_tempo, increment, cluster_low, cluster_high, target_reps, goal_date, custom_pattern_id, custom_block_index, custom_rep_in_block, current_tempo, current_streak, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       mode = excluded.mode,
       start_tempo = excluded.start_tempo,
       goal_tempo = excluded.goal_tempo,
       increment = excluded.increment,
       cluster_low = excluded.cluster_low,
       cluster_high = excluded.cluster_high,
       target_reps = excluded.target_reps,
       goal_date = excluded.goal_date,
       custom_pattern_id = excluded.custom_pattern_id,
       custom_block_index = excluded.custom_block_index,
       custom_rep_in_block = excluded.custom_rep_in_block,
       updated_at = excluded.updated_at;`,
    cfg.exercise_id,
    cfg.mode,
    cfg.start_tempo,
    cfg.goal_tempo,
    cfg.increment ?? null,
    cfg.cluster_low ?? null,
    cfg.cluster_high ?? null,
    cfg.target_reps,
    cfg.goal_date ?? null,
    cfg.custom_pattern_id ?? null,
    cfg.custom_block_index ?? null,
    cfg.custom_rep_in_block ?? null,
    current_tempo,
    current_streak,
    now,
  );
  return { ...cfg, current_tempo, current_streak, updated_at: now };
}

// Custom mode persists three position fields (current base + block index +
// rep in block) rather than just (current_tempo + current_streak). Kept
// separate from updateTempoLadderState so the step/cluster code path stays
// unchanged.
export async function updateCustomPosition(
  exerciseId: string,
  current_base: number,
  custom_block_index: number,
  custom_rep_in_block: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE tempo_ladder_progress
       SET current_tempo = ?, custom_block_index = ?, custom_rep_in_block = ?, updated_at = ?
       WHERE exercise_id = ?;`,
    current_base,
    custom_block_index,
    custom_rep_in_block,
    Date.now(),
    exerciseId,
  );
}

export async function getTempoLadder(exerciseId: string): Promise<TempoLadderProgress | null> {
  const db = getDb();
  const row = await db.getFirstAsync<TempoLadderProgress>(
    `SELECT * FROM tempo_ladder_progress WHERE exercise_id = ?;`,
    exerciseId,
  );
  return row ?? null;
}

export async function updateTempoLadderState(
  exerciseId: string,
  current_tempo: number,
  current_streak: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE tempo_ladder_progress SET current_tempo = ?, current_streak = ?, updated_at = ? WHERE exercise_id = ?;`,
    current_tempo,
    current_streak,
    Date.now(),
    exerciseId,
  );
}

// Used after a successful session (goal reached) to raise the floor of the
// ladder so the next session starts a notch higher.
export async function updateTempoLadderConfigBounds(
  exerciseId: string,
  fields: { start_tempo?: number; cluster_low?: number },
): Promise<void> {
  const sets: string[] = [];
  const args: (number | string)[] = [];
  if (fields.start_tempo !== undefined) {
    sets.push('start_tempo = ?');
    args.push(fields.start_tempo);
  }
  if (fields.cluster_low !== undefined) {
    sets.push('cluster_low = ?');
    args.push(fields.cluster_low);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  args.push(Date.now());
  args.push(exerciseId);
  const db = getDb();
  await db.runAsync(
    `UPDATE tempo_ladder_progress SET ${sets.join(', ')} WHERE exercise_id = ?;`,
    ...args,
  );
}

export type PassageTempoLadderProgress = {
  piece_id: string;
  current_tempo: number;
  goal_tempo: number;
};

/**
 * Bulk-fetch the Tempo Ladder progress for a set of passages.
 * Returns only passages that actually have a tempo ladder in progress.
 */
export async function getTempoLadderProgressForPassages(
  piece_ids: string[],
): Promise<PassageTempoLadderProgress[]> {
  if (piece_ids.length === 0) return [];
  const db = getDb();
  const placeholders = piece_ids.map(() => '?').join(', ');
  return db.getAllAsync<PassageTempoLadderProgress>(
    `SELECT e.piece_id AS piece_id, tp.current_tempo AS current_tempo, tp.goal_tempo AS goal_tempo
     FROM exercises e
     JOIN tempo_ladder_progress tp ON tp.exercise_id = e.id
     WHERE e.strategy = 'tempo_ladder'
       AND e.deleted_at IS NULL
       AND e.piece_id IN (${placeholders});`,
    ...piece_ids,
  );
}

export async function advanceClusterWindow(
  exerciseId: string,
  cluster_low: number,
  cluster_high: number,
  current_tempo: number,
  current_streak: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE tempo_ladder_progress
     SET cluster_low = ?, cluster_high = ?, current_tempo = ?, current_streak = ?, updated_at = ?
     WHERE exercise_id = ?;`,
    cluster_low,
    cluster_high,
    current_tempo,
    current_streak,
    Date.now(),
    exerciseId,
  );
}
