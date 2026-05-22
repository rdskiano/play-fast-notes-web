// Web shim — the Supabase → iPad SQLite import is iOS-only (the web app is
// already Supabase-native, so there's no local SQLite to import into). This
// file exists so the import path in `app/import-supabase.tsx` resolves on
// web without dragging `expo-sqlite` (and its WASM web worker) into the web
// bundle. expo-router's `require.context` enumerates all route files for
// every platform — the native route file's imports must resolve to web-safe
// stubs even though the `.web.tsx` placeholder is what actually renders.

export type ImportProgress = (line: string) => void;

export type ImportOptions = {
  email: string;
  password: string;
  wipeFirst: boolean;
  onProgress: ImportProgress;
};

export type ImportResult = {
  ok: boolean;
  tables: Record<string, number>;
  filesDownloaded: number;
  filesFailed: number;
};

export async function runImport(_opts: ImportOptions): Promise<ImportResult> {
  throw new Error('Supabase → SQLite import is iOS-only.');
}
