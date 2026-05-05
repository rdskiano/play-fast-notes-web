// Self-Led practice strategies — the broader umbrella that covers methods
// the app teaches and logs but does NOT drive (no metronome scheduler, no
// step counter). Includes Learn-Fast-Notes methods (Chunking, Add a Note)
// and general practice modes that musicians do every day (pitch work,
// phrasing, recording themselves, freeform).
//
// Each entry corresponds to one possible value of practice_log.strategy.
// The data shape is deliberately flat so the catalog can grow without
// schema churn — new entries are appended here.

export type SelfLedKey =
  | 'chunking'
  | 'add_a_note'
  | 'pitch'
  | 'phrasing'
  | 'recording'
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
  // True only for the strategy that captures audio.
  recordingMode?: boolean;
};

export const SELF_LED_STRATEGIES: SelfLedStrategy[] = [
  {
    key: 'chunking',
    title: 'Chunking',
    shortDescription: 'Play the chunk → shape the phrase → sip breath',
    longDescription:
      'Break the passage into the smallest musical unit you can play cleanly. Loop that unit until it feels easy, then chain into the next. Pause briefly between reps so your brain catalogues what just happened.',
    steps: [
      'Pick the smallest unit (a beat, a half-measure, two notes — whatever feels barely manageable).',
      'Play the chunk. Shape it like you mean it, not like a drill.',
      'Sip breath — short pause. Replay it.',
      'When it feels easy, extend the chunk by one note or beat.',
    ],
  },
  {
    key: 'add_a_note',
    title: 'Add a Note',
    shortDescription: 'Walk notes up one at a time',
    longDescription:
      'Start from a single note (or chord) and add one note at a time, replaying the growing fragment each round. Forwards from the start of a tricky bar; backwards from the target arrival point. Builds confidence into the hard spot from a place that already works.',
    steps: [
      'Pick a starting anchor — could be the first note of the passage, or the last (work backwards).',
      'Play it cleanly.',
      'Add the next note. Replay both. Add the next. Replay all three.',
      'When you stumble, drop one note off the end and rebuild.',
    ],
  },
  {
    key: 'pitch',
    title: 'Pitch / Intonation',
    shortDescription: 'Drone, tuner, slow-bow — whatever you need',
    longDescription:
      'Anything that anchors pitch: a drone in the key, a tuner watching the needle, slow long bows on a difficult interval, double-stops checking ringing strings. The app does not drive this — log it so it does not disappear when you remember tomorrow that you spent twenty minutes on intonation.',
    steps: [
      'Pick a tool: drone, tuner, ringing-fifths check, slow bow.',
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
      'Decide where the breath is. Play through that spot without breaking the line.',
      'Vary it: same line three different ways. Pick the one that feels right.',
    ],
  },
  {
    key: 'recording',
    title: 'Recording',
    shortDescription: 'Record yourself, listen back, log it',
    longDescription:
      'Hit record, play the passage, then listen with a critical ear. The microphone hears things you do not — rushed sixteenths, lopsided dynamics, intonation drift. Save the clip alongside the log entry so you can compare last week to this week.',
    steps: [
      'Tap Record. Wait one second, then play.',
      'Tap Stop when you finish.',
      'Tap Play. Listen all the way through without skipping.',
      'Save with a one-line note about what you heard.',
    ],
    recordingMode: true,
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
