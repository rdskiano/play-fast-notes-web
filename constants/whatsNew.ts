// "What's new" notes shown behind the bell in the library header.
//
// Add a new entry at the TOP whenever a push/OTA ships something user-visible
// — especially fixes for things that were silently broken, so users who hit
// the bug learn it's fixed instead of quietly losing trust in the app. Write
// in plain English for musicians: what they saw, what changed. Two or three
// sentences max.
//
// The `id` must be unique and stable (date + slug). The quiet dot on the bell
// appears whenever the newest entry's id differs from the user's last-seen id
// (stored in settings, so it follows the account across devices on web).

export type WhatsNewEntry = {
  id: string;
  /** Human-readable date shown above the note, e.g. 'July 21, 2026'. */
  date: string;
  title: string;
  body: string;
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-08-13-rotation-fix-for-real',
    date: 'August 13, 2026',
    title: 'The rotation fix, take two — actually fixed this time',
    body:
      'Yesterday\'s note said rotating your phone no longer scrambled the strategy cards — that fix didn\'t hold, and if you rotated you still got stretched, stacked cards. The real cause is now found and the fix verified on a simulator before shipping: rotate as much as you like, the cards stay in their two columns.',
  },
  {
    id: '2026-08-12-rotation-grid-and-blurb-clipping',
    date: 'August 12, 2026',
    title: 'Fixed: strategy cards scrambled after rotating your phone',
    body:
      'On iPhone, turning the phone sideways and back left the practice-strategy cards stretched and stacked wrong until you left the screen. They now snap back to their proper two-column layout the moment you rotate. Also fixed: the cards\' descriptions were getting cut off mid-sentence — they now always show in full.',
  },
  {
    id: '2026-08-12-wipe-guard-card-blurbs',
    date: 'August 12, 2026',
    title: 'A safety net for "Download my web library," and clearer strategy cards',
    body:
      'On the iPad app, "Download my web library" with the replace option could permanently delete passages and practice history that existed only on that iPad — with no warning about what would be lost. Now the app counts exactly what lives only on your device, tells you in plain English, and requires typing DELETE before anything is erased. Cancelling leaves everything untouched. Also: the six strategy cards now say when you\'d reach for each tool — like Rhythmic Variation for running sixteenths, or Rep Rotator for mock-audition practice near a performance — instead of just describing what they do.',
  },
  {
    id: '2026-07-28-crash-pencil-click-truth',
    date: 'July 28, 2026',
    title: 'Fixed: crash on "Save & finish," pencil marks vanishing, and the metronome dial now moves your ladder',
    body:
      'Three fixes from real practice sessions. Saving your end-of-session note could crash the iPad app — fixed, and your notes were never lost. Pencil annotations could show false "could not save" errors and then genuinely lose your marks on closing — fixed. And in Tempo Ladder, changing the metronome tempo mid-session now moves the ladder with it: your clean reps count at the tempo actually clicking, and your progress and resume point stay honest. Also: tapping Clean or Miss with a tool panel open now registers the rep instead of just closing the panel, and the Click-Up marking screen now reminds you to place one final mark after the last note.',
  },
  {
    id: '2026-07-27-practice-flow-batch',
    date: 'July 27, 2026',
    title: 'Smoother practice sessions: tempo settings carry over, and 6 small fixes',
    body:
      'When you mark several passages in the same piece, a new Tempo Ladder now starts with the same tempos and settings you used on the last one — no more re-typing your start and goal BPM for every passage. Also fixed: tapping outside an open tool (like the metronome) now closes it; the step-up message briefly flashed the wrong tempo; "End session" no longer sits right next to "Step up tempo" looking identical, so it\'s harder to end a session by accident; passage names on crowded pages no longer overlap the progress badge of the box above; and the end-of-session note now offers one-tap suggestions like "Introduce some variation."',
  },
  {
    id: '2026-07-27-ipad-pencil-palette',
    date: 'July 27, 2026',
    title: 'Fixed: Apple Pencil palette vanished on practice screens (iPad app)',
    body:
      'On the iPad app, opening the Pencil tool during practice made the drawing palette slide up and immediately disappear — the foot-pedal listener was stealing its focus. The palette now stays put (the foot pedal simply pauses while you draw). Also fixed: closing the Pencil tool without drawing anything showed a false "could not save" error.',
  },
  {
    id: '2026-07-21-metronome-first-start',
    date: 'July 21, 2026',
    title: 'Fixed: metronome could be silent on its first start',
    body:
      'On iPads especially, the very first metronome start after opening the app could play nothing — the button showed it running, but no click. Stopping and starting again worked around it. That is now fixed, and if sound ever fails to start, tapping anywhere on the page wakes it up.',
  },
  {
    id: '2026-07-20-offline-notation',
    date: 'July 20, 2026',
    title: 'Notation now works without internet',
    body:
      'The music notation in rhythm exercises, demos, and the Exercise Builder used to need an internet connection to draw. It is now built into the app itself, so your staves appear even on flaky or heavily filtered wifi — school networks included.',
  },
];

export const LATEST_WHATS_NEW_ID = WHATS_NEW[0]?.id ?? '';

/** Settings key holding the id of the newest entry the user has opened. */
export const WHATS_NEW_SEEN_KEY = 'whatsNew:lastSeenId';
