import { getDb } from '../client';

export type ClickUpProgress = {
  exercise_id: string;
  current_index: number;
  updated_at: number;
};

export async function upsertClickUpProgress(
  exercise_id: string,
  current_index: number,
): Promise<ClickUpProgress> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO click_up_progress (exercise_id, current_index, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET current_index = excluded.current_index, updated_at = excluded.updated_at;`,
    exercise_id,
    current_index,
    now,
  );
  return { exercise_id, current_index, updated_at: now };
}

export async function getClickUpProgress(
  exercise_id: string,
): Promise<ClickUpProgress | null> {
  const db = getDb();
  const row = await db.getFirstAsync<ClickUpProgress>(
    `SELECT * FROM click_up_progress WHERE exercise_id = ?;`,
    exercise_id,
  );
  return row ?? null;
}

export async function setClickUpIndex(
  exercise_id: string,
  current_index: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE click_up_progress SET current_index = ?, updated_at = ? WHERE exercise_id = ?;`,
    current_index,
    Date.now(),
    exercise_id,
  );
}
