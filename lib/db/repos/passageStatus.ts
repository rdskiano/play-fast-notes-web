// Per-passage practice status for the document viewer overlay badge.
// One batched read per document focus: last practice date and Tempo Ladder %
// for every passage on the page at once. Mirrors the web version (Supabase
// joins client-side) but uses local SQLite reads — the join is trivial here
// because the tables are co-located.

import { getDb } from '../client';

export type PassageStatus = {
  lastPracticedAt: number | null;
  tempoLadderPercent: number | null;
};

export async function getDocumentPassageStatus(
  passageIds: string[],
): Promise<Map<string, PassageStatus>> {
  const result = new Map<string, PassageStatus>();
  if (passageIds.length === 0) return result;

  const db = getDb();
  const placeholders = passageIds.map(() => '?').join(', ');

  // Last practiced timestamp per passage (the MAX of practice_log.practiced_at).
  const lastRows = await db.getAllAsync<{ piece_id: string; last: number }>(
    `SELECT piece_id, MAX(practiced_at) AS last
       FROM practice_log
      WHERE piece_id IN (${placeholders})
      GROUP BY piece_id;`,
    ...passageIds,
  );
  const lastPracticed = new Map<string, number>();
  for (const row of lastRows) {
    if (row.last != null) lastPracticed.set(row.piece_id, row.last);
  }

  // Tempo Ladder % per passage — through the exercises table to tempo_ladder_progress.
  const tlRows = await db.getAllAsync<{
    piece_id: string;
    current_tempo: number;
    goal_tempo: number;
  }>(
    `SELECT e.piece_id AS piece_id, p.current_tempo AS current_tempo, p.goal_tempo AS goal_tempo
       FROM exercises e
       JOIN tempo_ladder_progress p ON p.exercise_id = e.id
      WHERE e.piece_id IN (${placeholders}) AND e.strategy = 'tempo_ladder';`,
    ...passageIds,
  );
  const tlByPassage = new Map<string, number>();
  for (const row of tlRows) {
    if (!row.goal_tempo || row.goal_tempo <= 0) continue;
    const pct = Math.max(
      0,
      Math.min(100, Math.round((row.current_tempo / row.goal_tempo) * 100)),
    );
    tlByPassage.set(row.piece_id, pct);
  }

  for (const id of passageIds) {
    result.set(id, {
      lastPracticedAt: lastPracticed.get(id) ?? null,
      tempoLadderPercent: tlByPassage.get(id) ?? null,
    });
  }
  return result;
}
