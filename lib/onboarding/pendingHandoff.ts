// Carries the onboarding handoff intent across the sign-up boundary.
//
// In the value-first funnel a stranger goes through the Bumblebee taste with NO
// account, then taps a handoff that requires one ("add my own music" / "save
// this"). We stash what they wanted here, send them to /sign-in, and once they
// authenticate the sign-in screen reads this back to finish the job (seed the
// sample, then land them where they intended). Web-only (localStorage); the
// onboarding-before-auth flow is a web concern.

const KEY = 'pfn:onboarding-handoff';

export type HandoffIntent = 'upload' | 'library';
export type PendingHandoff = { intent: HandoffIntent; bucketId: string };

export function setPendingHandoff(h: PendingHandoff): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(h));
    }
  } catch {
    // best-effort
  }
}

/** Read and clear the pending handoff (one-shot). */
export function takePendingHandoff(): PendingHandoff | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as PendingHandoff;
    if (
      parsed &&
      (parsed.intent === 'upload' || parsed.intent === 'library') &&
      typeof parsed.bucketId === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
