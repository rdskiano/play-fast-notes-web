// No-op on native — service workers are a browser concept. The web sibling
// (registerServiceWorker.web.ts) does the real registration; Metro picks the
// right file per platform, and TypeScript sees this (.ts) version by default.

export async function registerServiceWorker(): Promise<void> {
  // Intentionally empty.
}
