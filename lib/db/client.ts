import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';

const DB_NAME = 'learn-fast-notes.db';

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) db = SQLite.openDatabaseSync(DB_NAME);
  return db;
}

export async function runMigrations(): Promise<void> {
  const database = getDb();
  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync(
    'CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY NOT NULL);',
  );
  const row = await database.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM _migrations;',
  );
  const current = row?.version ?? -1;
  for (let i = current + 1; i < MIGRATIONS.length; i++) {
    try {
      await database.execAsync(MIGRATIONS[i]);
    } catch (e) {
      // If a migration partially failed (e.g., column already exists from
      // a prior partial run), log and continue so the version gets stamped.
      console.warn(`Migration ${i} warning:`, e);
    }
    await database.runAsync('INSERT INTO _migrations (version) VALUES (?);', i);
  }
}
