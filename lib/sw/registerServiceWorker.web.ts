// Registers the Supabase-storage cache service worker (public/sw.js) and asks
// for durable storage. Web sibling of the native no-op in
// registerServiceWorker.ts — Metro resolves the right one per platform.

export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    // PWA-installed users (iOS Safari especially) get durable storage so the
    // OS doesn't evict the cache under pressure. Tab-only users see the same
    // UX; their storage just isn't guaranteed durable.
    if (navigator.storage?.persist) {
      try {
        await navigator.storage.persist();
      } catch {
        // The Persist API can throw on some browsers; ignore.
      }
    }
  } catch (err) {
    console.warn('[sw] registration failed', err);
  }
}
