import { getDb } from '../client';

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value_json: string }>(
    'SELECT value_json FROM settings WHERE key = ?;',
    key,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as string;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?);',
    key,
    JSON.stringify(value),
  );
}
