// Shared help-modal copy. Strings here are surfaced by the global "?"
// button via <TutorialStep>. Keeping the cross-screen blocks in one
// place stops them drifting apart as screens are added.

import { Platform } from 'react-native';

// The persistent Clean/Miss shortcut hint shown during play phases (Tempo
// Ladder, Rep Rotator). On web a laptop keyboard is the common case; in the
// native iPad app there is no spacebar in sight — only a paired Bluetooth
// pedal (which registers as a keyboard) — so the copy must not mention Space.
export const SHORTCUT_HINT_LINE =
  Platform.OS === 'web'
    ? 'Space or foot pedal = Clean · X = Miss'
    : 'Foot pedal = Clean · X = Miss';

// The floating practice tools (PracticeToolsLayer) appear on every
// score-viewing and practice screen. Append this block to those screens'
// help bodies so the "?" always explains the dock. Not every screen
// mounts every tool, so the copy is deliberately general.
export const PRACTICE_TOOLS_HELP =
  'Practice tools: tap a tab on the edge of the screen to pop out a tool — drag it to reposition, pinch to resize, tap the tab again to dock it.\n\n' +
  '🥁 Metronome — play/stop, set the tempo, meter, and subdivision, and tap out beat accents. Along the bottom: RHYTHMS swaps the click for a drum groove matched to your meter (rock, waltz, etc.), DRONE adds a steady pitch underneath to tune against, and GAPS randomly silences a share of the beats so you keep time on your own.\n' +
  '⏱ Timers — optional nudges to rotate passages, take a micro-break, play it cold, or move your body.\n' +
  '🎤 Recorder — capture a take and play it back; saved takes attach to your practice log.\n' +
  '✏️ Pencil — mark up the score (stylus only; the tab appears when a pen is detected).';
