// Self-Led practice strategies — the broader umbrella that covers methods
// the app teaches and logs but does NOT drive (no metronome scheduler, no
// step counter). Includes Learn-Fast-Notes methods (Chunking, Add a Note)
// and general practice modes that musicians do every day (pitch work,
// phrasing, freeform).
//
// "Recording" used to be in this list, but the Recorder is now a
// cross-cutting practice tool available on every screen — there's no
// reason to make it a separate self-led strategy. The 'recording' key
// is still tolerated by `getSelfLedStrategy` to keep old practice-log
// rows readable.
//
// Each entry corresponds to one possible value of practice_log.strategy.
// The data shape is deliberately flat so the catalog can grow without
// schema churn — new entries are appended here.

export type SelfLedKey =
  | 'chunking'
  | 'add_a_note'
  | 'pitch'
  | 'phrasing'
  | 'freeform';

export type SelfLedStrategy = {
  key: SelfLedKey;
  title: string;
  // One-line tagline shown on the card.
  shortDescription: string;
  // Longer paragraph shown when the user taps the info chevron.
  longDescription: string;
  // Bullet steps shown alongside the long description.
  steps: string[];
  // Surfaced visibly per design principle "Attribution is marketing, not baggage."
  attribution?: string;
};

export const SELF_LED_STRATEGIES: SelfLedStrategy[] = [
  {
    key: 'chunking',
    title: 'Chunking',
    shortDescription:
      'Play the chunk, start with an accent then dim through → sip breath (move eyes and fingers to the start of next chunk) → Repeat',
    longDescription:
      'Break the passage into the smallest musical unit you can play cleanly - maybe 1 beat, maybe 2.\nPlay the chunk, start with an accent then dim through → sip breath (move eyes and fingers to the start of next chunk) → Repeat',
    steps: [
      'Pick the smallest unit (a beat, a half-measure, two notes — whatever feels barely manageable).',
      'Play the chunk. Shape it by starting with an accent and diminuendo.',
      'Sip breath — move eyes and fingers to the start of next chunk (this is crucial).',
      'When it feels easy, extend the chunk by one note or beat.',
    ],
  },
  {
    key: 'add_a_note',
    title: 'Add a Note',
    shortDescription:
      "Start by playing one note, then add one note at a time until it's comfortable - can be done at performance tempo.",
    longDescription:
      'Start from a single note (or chord) and add one note at a time, replaying the growing fragment each round and repeating to rid yourself of hesitation or confusion. Start from the first note of a passage, or start on the last note and build backward to experience growing confidence throughout.',
    steps: [
      'Pick a starting anchor — could be the first note of the passage, or the last (work backwards).',
      'Play it cleanly.',
      'Add the next note. Replay both. Add the next. Replay all three.',
      'When you stumble, drop one note off the end and rebuild. The goal is lack of confusion or hesitation.',
    ],
  },
  {
    key: 'pitch',
    title: 'Pitch / Intonation',
    shortDescription: 'Drone, tuner, etc.',
    longDescription:
      'Anything that anchors pitch: a drone in the key, a tuner watching the needle, slow long bows on a difficult interval, double-stops checking ringing strings. The app does not drive this — log it so it does not disappear when you remember tomorrow that you spent twenty minutes on intonation.',
    steps: [
      'Pick a tool: drone, tuner.',
      'Slow down well below tempo. Listen for the lock-in.',
      'Repeat the troubled interval / chord until it stops surprising you.',
    ],
  },
  {
    key: 'phrasing',
    title: 'Phrasing',
    shortDescription: 'Shape the line — breath, dynamics, arrival',
    longDescription:
      'Step out of the technique loop and ask musical questions. Where does this phrase want to go? Where does it breathe? What is the arrival point, and what gets you there? Often best done at half tempo with the metronome off entirely.',
    steps: [
      'Sing the line first if you can — yes really.',
      'Mark the arrival point with your eyes. Aim everything at it.',
      'Decide where the breath or bow change will be and rehearse it.',
      'Vary it: same line three different ways. Pick the one that feels right.',
    ],
  },
  {
    key: 'freeform',
    title: 'Freeform / Other',
    shortDescription: 'Anything else worth logging',
    longDescription:
      'Catch-all for whatever does not fit the other categories — score study, mental practice, fingering experiments, working with a teacher recording, sight-reading the next page. If you want it to count, log it here with a note about what you actually did.',
    steps: [
      'Do the work.',
      'Tap DONE.',
      'Write a short note so future-you remembers what you actually did.',
    ],
  },
];

export function getSelfLedStrategy(key: string): SelfLedStrategy | null {
  return SELF_LED_STRATEGIES.find((s) => s.key === key) ?? null;
}
