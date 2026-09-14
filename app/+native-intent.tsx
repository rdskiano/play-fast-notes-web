// Gatekeeper for system-delivered URLs (expo-router's +native-intent hook).
//
// When another app hands us a PDF ("Copy to Play Fast"), iOS launches or
// wakes the app with the file's sandbox path, and expo-router would try to
// treat that path as a route — landing on Unmatched Route (seen in the sim,
// 2026-09-14). The file itself is already captured by
// lib/files/incomingShare (a plain Linking listener that runs regardless of
// routing); all routing needs to do is put the user on the library, which
// consumes the pending share into the Add window's name step on focus.
// Everything that isn't a shared PDF passes through untouched so normal
// scheme deep links keep working.

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (/\.pdf$/i.test(path.split('?')[0])) return '/library';
  return path;
}
