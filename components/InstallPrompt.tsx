// Native no-op. The InstallPrompt is a web-only affordance — once the
// iPad app ships through TestFlight / the App Store, there's no
// equivalent of "Add to Home Screen" to coach the user through.
// The .web.tsx sibling is the real implementation; Metro resolves
// this file on iOS/Android and the .web.tsx on web.

export function InstallPrompt() {
  return null;
}
