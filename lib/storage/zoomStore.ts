// Per-passage zoom/pan persistence — NATIVE (iOS).
//
// The web sibling (zoomStore.web.ts) uses localStorage; native has no such
// store, so the user's per-passage zoom/size used to live only in memory and
// vanish on every app restart. We back it with a single small JSON file under
// the app's sandboxed document directory (the same filesystem pattern as
// lib/supabase/sessionStore.ts) — deliberately avoiding AsyncStorage/SecureStore
// so no native rebuild is needed.
//
// The whole key→transform map lives in one file. It's loaded once
// (asynchronously) into an in-memory cache on first use; reads are sync from
// that cache. Writes update the cache and persist the whole map (the map is
// tiny and writes are infrequent — only on passage switch / unmount).

import { Directory, File, Paths } from 'expo-file-system';

export type SavedTransform = { scale: number; tx: number; ty: number };

const cache = new Map<string, SavedTransform>();
const dir = new Directory(Paths.document, 'zoom');
const file = new File(dir, 'transforms.json');

function valid(t: unknown): t is SavedTransform {
  return (
    !!t &&
    typeof (t as SavedTransform).scale === 'number' &&
    typeof (t as SavedTransform).tx === 'number' &&
    typeof (t as SavedTransform).ty === 'number'
  );
}

// Load the whole map once. Kicked off at module load so the cache is usually
// warm by the time the user opens a passage.
let loadPromise: Promise<void> | null = null;
function load(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        if (!file.exists) return;
        const raw = await file.text();
        const obj = JSON.parse(raw) as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          if (valid(v)) cache.set(k, v);
        }
      } catch {
        // Missing / corrupt file — start with an empty cache.
      }
    })();
  }
  return loadPromise;
}
void load();

function persist(): void {
  try {
    if (!dir.exists) dir.create({ intermediates: true });
    const obj = Object.fromEntries(cache);
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(obj));
  } catch {
    // A failed write just means the zoom resets on next launch — not fatal.
  }
}

/** Best-effort SYNCHRONOUS read from the in-memory cache. On a cold start the
 *  file may not be loaded yet (returns undefined); hydrateZoom covers that. */
export function loadZoom(key: string): SavedTransform | undefined {
  return cache.get(key);
}

export function saveZoom(key: string, t: SavedTransform): void {
  cache.set(key, t);
  persist();
}

/** Apply the saved transform once the on-disk map has loaded. Used by the
 *  caller to set the zoom on a cold start where the sync read missed. */
export function hydrateZoom(
  key: string,
  apply: (t: SavedTransform) => void,
): void {
  const cached = cache.get(key);
  if (cached) {
    apply(cached);
    return;
  }
  void load().then(() => {
    const t = cache.get(key);
    if (t) apply(t);
  });
}
