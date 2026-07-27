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
