// NATIVE last-known-subscription snapshot. Backed by the same filesystem KV
// store the Supabase auth session uses (no new dependency, no rebuild). The
// web sibling uses localStorage — sessionStore's expo-file-system paths only
// exist on native, and importing it on web crashes the bundle at load.

import { fileSessionStore } from '@/lib/supabase/sessionStore';

export async function readSubscriptionCache(
  key: string,
): Promise<string | null> {
  return fileSessionStore.getItem(key);
}

export function writeSubscriptionCache(key: string, value: string): void {
  fileSessionStore.setItem(key, value);
}
