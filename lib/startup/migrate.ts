// Native startup: run SQLite migrations. Resolved by Metro on iOS/Android.
// Web uses migrate.web.ts (a no-op).
//
// Fresh installs used to be seeded here with bundled starter content
// (seedIfEmpty — Ralph's own library export). Retired 2026-08-15: new users
// now start with an empty library and the designed first-passage hero.
// cleanupStarterSeed removes the old starter content from installs that
// earlier binaries already seeded (strictly guarded — see lib/db/seedCleanup).

import { runMigrations } from '@/lib/db/client';
import { cleanupStarterSeed } from '@/lib/db/seedCleanup';

export async function startupMigrate(): Promise<void> {
  await runMigrations();
  await cleanupStarterSeed();
}
