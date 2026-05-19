// Native startup: run SQLite migrations and seed if empty. Resolved by
// Metro on iOS/Android. Web uses migrate.web.ts (a no-op).

import { runMigrations } from '@/lib/db/client';
import { seedIfEmpty } from '@/lib/db/seed';

export async function startupMigrate(): Promise<void> {
  await runMigrations();
  await seedIfEmpty();
}
