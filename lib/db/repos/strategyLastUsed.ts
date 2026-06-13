import type { SelfLedKey } from '@/lib/strategies/selfLed';

import { getDb } from '../client';
import type { Strategy } from './exercises';

// The last-used stamp covers more than the app-driven exercise strategies:
// self-led methods and recordings stamp it too, so the practice-log views
// can show "last touched" for every kind of session.
export type StampableStrategy = Strategy | SelfLedKey | 'recording';

export type StalenessRow = { strategy: StampableStrategy; last_used_at: number };

export async function stampLastUsed(
  piece_id: string,
  strategy: StampableStrategy,
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO strategy_last_used (piece_id, strategy, last_used_at)
     VALUES (?, ?, ?)
     ON CONFLICT(piece_id, strategy) DO UPDATE SET last_used_at = excluded.last_used_at;`,
    piece_id,
    strategy,
    now,
  );
}

export async function getStalenessForPassage(piece_id: string): Promise<StalenessRow[]> {
  const db = getDb();
  return db.getAllAsync<StalenessRow>(
    `SELECT strategy, last_used_at FROM strategy_last_used WHERE piece_id = ?;`,
    piece_id,
  );
}
