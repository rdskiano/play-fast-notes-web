// iOS app-sandbox path healing (native only — import from native-bundle files).
//
// iOS app-sandbox paths embed a per-install UUID
// (…/Application/<UUID>/Documents/…) that changes on every reinstall — and a
// TestFlight or App Store update counts as a reinstall. So an absolute path
// saved in a previous install points into a container that no longer exists,
// even though the file itself was carried forward into the new container.
// Re-root the part after "/Documents/" onto the CURRENT documents directory so
// old-library image and PDF paths stay valid across updates. If the marker
// isn't present, or it's a remote/relative URI, it's returned unchanged. Pure
// string rewrite — no file I/O — so it's safe to run on every row of a list.
import { Paths } from 'expo-file-system';

export function toCurrentContainerUri(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  const marker = '/Documents/';
  const i = uri.indexOf(marker);
  if (i === -1) return uri;
  const tail = uri.slice(i + marker.length);
  const base = Paths.document.uri.replace(/\/+$/, '');
  return `${base}/${tail}`;
}
