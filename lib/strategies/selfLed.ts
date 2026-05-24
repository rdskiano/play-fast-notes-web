// Self-Led practice strategies — the broader umbrella that covers methods
// the app teaches and logs but does NOT drive (no metronome scheduler, no
// step counter). Scoped to methods that directly help the user learn fast
// notes — Chunking, Add a Note, and a Freeform catch-all. Pitch /
// intonation and Phrasing used to live here but were removed 2026-05-24
// because they're general musicianship topics that don't fit the tool's
// fast-notes focus. The STRATEGY_LABELS maps in the practice-log views
// keep entries for 'pitch' and 'phrasing' so old log rows render
// gracefully if any exist.
//
// "Recording" was also removed earlier — the Recorder is now a
// cross-cutting practice tool available on every screen, so a separate
// self-led key is redundant. Old 'recording' log rows still render via
// the STRATEGY_LABELS fallback.
//
// Each entry corresponds to one possible value of practice_log.strategy.
// The data shape is deliberately flat so the catalog can grow without
// schema churn — new entries are appended here.

export type SelfLedKey = 'chunking' | 'add_a_note' | 'freeform';

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
