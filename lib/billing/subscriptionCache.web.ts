// WEB last-known-subscription snapshot — localStorage, mirroring how the web
// Supabase client stores its session. Guarded for SSR/static export where
// window does not exist.

export async function readSubscriptionCache(
  key: string,
): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSubscriptionCache(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort cache; ignore quota/private-mode failures.
  }
}
