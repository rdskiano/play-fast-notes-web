// Per-passage zoom/pan persistence — WEB.
//
// Backed by localStorage so the size/zoom the user dials in on a passage
// STICKS across reloads and new sessions. The in-memory Map is the sync fast
// path; localStorage is the durable store. The native sibling (zoomStore.ts)
// mirrors this API on a filesystem-backed store, because localStorage is
// undefined on iOS and the setting would otherwise vanish on every app restart.

export type SavedTransform = { scale: number; tx: number; ty: number };

const cache = new Map<string, SavedTransform>();
const PREFIX = 'pfn:zoom:';

function valid(t: unknown): t is SavedTransform {
  return (
    !!t &&
    typeof (t as SavedTransform).scale === 'number' &&
    typeof (t as SavedTransform).tx === 'number' &&
    typeof (t as SavedTransform).ty === 'number'
  );
}

/** Best-effort SYNCHRONOUS read — used to seed the first render. */
export function loadZoom(key: string): SavedTransform | undefined {
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (valid(parsed)) {
      cache.set(key, parsed);
      return parsed;
    }
  } catch {
    // Corrupt / unavailable storage — fall back to no saved transform.
  }
  return undefined;
}

export function saveZoom(key: string, t: SavedTransform): void {
  cache.set(key, t);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFIX + key, JSON.stringify(t));
    }
  } catch {
    // Storage full / disabled — the in-memory cache still works this session.
  }
}

/** Apply the saved transform once it's available. On web the store is sync,
 *  so this resolves immediately; the async signature exists to match native. */
export function hydrateZoom(
  key: string,
  apply: (t: SavedTransform) => void,
): void {
  const t = loadZoom(key);
  if (t) apply(t);
}
