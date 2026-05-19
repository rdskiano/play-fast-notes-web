// Web startup: no-op. Web's data layer uses Supabase directly; there are
// no local SQLite migrations to run. This file exists so Metro's web
// resolver picks it up instead of migrate.ts, keeping expo-sqlite out of
// the web bundle.

export async function startupMigrate(): Promise<void> {
  // intentionally empty
}
