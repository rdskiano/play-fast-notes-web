// MIDI note → display name ("A4", "F♯3"). Single source of truth so the
// metronome panel and the practice log spell the drone pitch identically.

export const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
];

export function noteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
