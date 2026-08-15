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
    id: '2026-08-14-ladder-honesty',
    date: 'August 14, 2026',
    title: 'The Tempo Ladder remembers honestly, and helps when you are stuck',
    body:
      'If you turned the metronome down mid-session, your next session used to reopen at the old, higher start tempo and quietly overwrite your real progress. Now the ladder reopens right where you actually left off, and just opening a session without playing a rep no longer moves your progress number. One more thing: if you miss three times at a tempo before landing a clean run, the coach now offers to drop the tempo for you, one tap. "No thanks" keeps it quiet for the rest of the session.',
  },
  {
    id: '2026-08-14-evaluation-shows-the-music',
    date: 'August 14, 2026',
    title: 'The first-practice measurement now shows your music',
    body:
      'The measurement flow was asking "can you play it?" on a screen that hid the passage. The passage now sits right under every step, pinch to zoom, so you can see exactly what you are being asked to play.',
  },
  {
    id: '2026-08-14-skip-a-note',
    date: 'August 14, 2026',
    title: 'Entering rests in the Exercise Builder: one simple key',
    body:
      'The rest palette from yesterday (16th, 8th, quarter, dot, triplet mode) turned out to require translation math that was easy to get silently wrong. It is now a single "Skip a note" key: one tap for each missing note, counted the way you read your own passage. Also fixed: backing out of a brand-new exercise before entering any notes no longer leaves an empty exercise in your list.',
  },
  {
    id: '2026-08-14-score-page-pills-polish',
    date: 'August 14, 2026',
    title: 'Passage pills: easier to spot, quicker to get out of the way',
    body:
      'The name pills on your score pages are now solid blue with white text, so they stand out instead of fading into the page. And when you tap one to open a spot, every pill disappears so nothing sits on top of your music — just the highlighted box, with its Practice, Edit, and History buttons floating right above it. Tap anywhere else on the page and the pills come back.',
  },
  {
    id: '2026-08-13-exercise-builder-rests',
    date: 'August 13, 2026',
    title: 'The Exercise Builder can finally hold its breath',
    body:
      'Passages that start with — or contain — a rest couldn\'t be entered into the Exercise Builder before. There\'s now a rest palette above the piano: tap a 16th, 8th, or quarter rest and the app fits it into your running sixteenths automatically. A · button dots the next rest, and ³ is for passages that run in triplets. Generated exercises re-time the rest along with the notes — the notes after it land in new, sometimes surprising places, which is exactly the kind of displacement practice you can\'t give yourself. Playback and the printable PDF include the rests too.',
  },
  {
    id: '2026-08-13-coach-proposes-the-note',
    date: 'August 13, 2026',
    title: 'The end-of-session note now comes with a suggestion',
    body:
      'The coach watched your session, so when you finish, its pick among the choices is marked with a * and a short line explaining why. Tap any choice and the app will remind you of it once, next session — and there\'s always a notes box for your own words.',
  },
  {
    id: '2026-08-13-first-practice-evaluation',
    date: 'August 13, 2026',
    title: 'New passages start with a one-minute measurement',
    body:
      'The first time you practice a passage, the app now takes its measurements: the goal tempo (offered automatically once you\'ve set one for any other passage in the same section — always changeable), one try straight at that goal — if it\'s clean, the passage is marked performance-ready and you\'re done — and if not, you find your comfortable clean tempo. Then the Tempo Ladder is set up for you: starting a notch below your clean tempo, aiming at the goal. You type nothing.',
  },
  {
    id: '2026-08-13-coach-reads-your-trail',
    date: 'August 13, 2026',
    title: 'The coach now reads your practice history',
    body:
      '"How should I practice?" no longer asks you a list of questions. It looks at what you\'ve actually done with the passage and makes one suggestion with the reason spelled out — for example, after a few steady Tempo Ladder sessions it suggests Interleaved Click-Up to cement what you\'ve built. The full strategy list is right below it, so the coach only ever suggests; you decide.',
  },
  {
    id: '2026-08-13-land-on-the-page',
    date: 'August 13, 2026',
    title: 'After a session, you land back on the page',
    body:
      'When you finish and log a practice session on a passage that lives in a PDF or photo, the app now returns you to that page of the score — right where the passage is — instead of the passage screen. You finish a spot, you\'re looking at the music, ready to pick the next one. Passages that aren\'t part of a bigger page work the way they always did.',
  },
  {
    id: '2026-08-13-pills-first-pages',
    date: 'August 13, 2026',
    title: 'A cleaner score: passage boxes became name pills',
    body:
      'On PDF and photo pages, your marked passages no longer sit under gray rectangles. Each one is now a small name pill at the spot where it starts — the score itself stays clean. Tap a pill and that one passage lights up, with Practice, Edit, and History right there; tap anywhere on the score to tuck it away. Passages inside other passages finally work: only one box ever draws at a time, and pills that would land on top of each other stack neatly. The old "Hide boxes" button is now "View a blank page" for a completely clean read.',
  },
  {
    id: '2026-08-13-smarter-session-notes',
    date: 'August 13, 2026',
    title: 'End-of-session notes that come back ready to act',
    body:
      'The one-tap suggestions at the end of a session now match the tool you just used — after Tempo Ladder you\'ll see "Keep climbing the tempo," after Interleaved Click-Up you\'ll see "Use larger units next time," and so on. Tapping a suggestion automatically checks "Remind me of this next time" (uncheck it and your choice wins). When a reminder greets you on the passage screen, it now carries buttons that take you straight into the right tool — "Start slower next time" even opens Tempo Ladder with your start tempo already dropped about 10%, and an Exercise Builder reminder reopens the exact exercise you built, ready to play. Each reminder shows once: after your next session on that passage it stops nagging, though the note stays in your practice log.',
  },
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
