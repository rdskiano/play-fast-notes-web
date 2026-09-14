import { Directory, File, Paths } from 'expo-file-system';
import { Linking } from 'react-native';

// Share-sheet PDF import (native). iOS copies a PDF shared to us ("Copy to
// Play Fast") into Documents/Inbox/ and launches or wakes the app with that
// file:// URL. This module catches the URL (cold start via getInitialURL,
// warm via the 'url' event), moves the file out of Inbox into our cache
// under a timestamped name (Inbox is not a keeping place, and same-path
// overwrites are an iOS caching trap), and holds it as the single pending
// share until the library screen consumes it into the Add window's name
// step. Non-file URLs (the playfastnotes:// scheme links) pass through
// untouched; expo-router keeps owning those.
//
// Requires the CFBundleDocumentTypes declaration in app.json — binaries
// without it (runtime 1.1.1) never receive file:// URLs, so this code is
// safely dormant when it ships by OTA ahead of the 1.2.0 build.
// Plan: SHARE_SHEET_IMPORT_PLAN.md.

export type IncomingPdf = { uri: string; name: string };

let pending: IncomingPdf | null = null;
const listeners = new Set<() => void>();
let started = false;

function fileNameFromUrl(url: string): string {
  const last = url.split('/').pop() ?? 'document.pdf';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

async function handleUrl(url: string): Promise<void> {
  if (!url.startsWith('file://')) return;
  if (!/\.pdf$/i.test(url.split('?')[0])) return;
  try {
    const name = fileNameFromUrl(url);
    const dir = new Directory(Paths.cache, 'incoming-share');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, `${Date.now()}-${name}`);
    const src = new File(url);
    src.copy(dest);
    try {
      // Best-effort: clear the Inbox original so iOS doesn't accumulate copies.
      src.delete();
    } catch {
      /* Inbox cleanup is nice-to-have */
    }
    pending = { uri: dest.uri, name };
    listeners.forEach((fn) => fn());
  } catch (e) {
    console.warn('[incomingShare] failed to accept shared PDF', e);
  }
}

/** Idempotent; call once from the root layout (native). */
export function startIncomingShareListener(): void {
  if (started) return;
  started = true;
  Linking.addEventListener('url', ({ url }) => void handleUrl(url));
  Linking.getInitialURL()
    .then((url) => (url ? handleUrl(url) : undefined))
    .catch(() => undefined);
}

/** Take the pending shared PDF, if any. Callers check busy-state BEFORE
 *  consuming — a consumed share that can't be shown is lost. */
export function consumePendingShare(): IncomingPdf | null {
  const p = pending;
  pending = null;
  return p;
}

/** Notifies when a share arrives; the callback should call
 *  consumePendingShare itself (after its own guards). Returns unsubscribe. */
export function subscribeIncomingShare(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
