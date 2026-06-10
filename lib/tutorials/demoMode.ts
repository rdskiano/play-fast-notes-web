// Demo / QA account that always experiences the app "for the first time".
//
// When signed in as DEMO_TUTORIAL_EMAIL, the app never reads or writes the
// "you've already seen this" flags for any onboarding surface (guided tours,
// the "?" help modals, the Click-Up / PDF coaches, the Macro-Chaining tips).
// Every walkthrough therefore fires fresh on each page load, so we can iterate
// on the onboarding UX without manually clearing flags or appending
// ?tour=1 / ?tutorial=1 to URLs.
//
// Web-only by nature: it's keyed on the signed-in Supabase email, and native
// (single-user SQLite) has no such account. The gate lives in the web settings
// repo (lib/db/repos/settings.web.ts), which is the single chokepoint every
// one of these flags flows through — so it also covers any tutorial added
// later, as long as its "seen" key matches isTutorialSeenKey() below.
//
// Note: a re-fire happens per page LOAD, not per navigation within a load —
// the help modal keeps a per-session in-memory guard. Reload to see a tutorial
// again, which is the normal loop while editing it anyway.

export const DEMO_TUTORIAL_EMAIL = 'newbie@newbie.com';

// True for settings keys that record "this onboarding surface has been seen".
// Keep this in sync when adding a new tutorial/coach that persists a flag.
export function isTutorialSeenKey(key: string): boolean {
  return (
    key.startsWith('tour.seen.') || // guided spotlight tours (useScreenTour)
    key.startsWith('help.autoSeen.') || // TutorialStep "?" modals
    key === 'clickUp.coachSeen' || // Click-Up first-run coach
    key === 'macro_info_seen' || // Macro-Chaining per-step Quick Tips
    key === 'pdfBox.coached' // PDF box-drawing coach (document viewer)
  );
}
