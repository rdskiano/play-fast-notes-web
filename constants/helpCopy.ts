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

// Same idea for Interleaved Click-Up's NEXT/BACK hint.
export const SHORTCUT_HINT_NEXT_BACK =
  Platform.OS === 'web'
    ? 'Space / Enter / right pedal = NEXT · ← / Backspace / left pedal = BACK'
    : 'Right pedal = NEXT · left pedal = BACK';

// The practice tools appear on every score-viewing and practice screen.
// Two variants because two generations of the tools UI coexist:
//   PRACTICE_TOOLS_HELP — the top-right icon pill (PracticeToolsBar), used
//     by the reskinned screens (passage detail, document viewer, all the
//     practice run screens).
//   PRACTICE_TOOLS_EDGE_HELP — the edge-docked tabs (PracticeToolsLayer),
//     still used by Chunking, both Self-Led screens, and rhythm-builder on
//     phones. If a screen migrates to the pill, switch its help body too.
// Not every screen mounts every tool, so the copy is deliberately general.

const TOOL_LINES =
  '🥁 Metronome — play/stop, set the tempo, meter, and subdivision, and tap out beat accents. Along the bottom: RHYTHMS swaps the click for a drum groove matched to your meter (rock, waltz, etc.), DRONE adds a steady pitch underneath to tune against, and GAPS randomly silences a share of the beats so you keep time on your own.\n' +
  '⏱ Timers — optional nudges to rotate passages, take a micro-break, play it cold, or move your body.\n' +
  '🎤 Recorder — capture a take and play it back; saved takes attach to your practice log.\n';

export const PRACTICE_TOOLS_HELP =
  'Practice tools: the row of icons in the white pill at the top-right. Tap an icon to open that tool right below it; tap it again, or tap anywhere else on the screen, to put it away.\n\n' +
  TOOL_LINES +
  '✏️ Pencil — mark up the score. While you draw, a red ↶ appears in the pill to undo your last mark; tap the ✓ to save your marks and put the pencil down.';

export const PRACTICE_TOOLS_EDGE_HELP =
  'Practice tools: tap a tab on the edge of the screen to pop out a tool — drag it to reposition, pinch to resize, tap the tab again to dock it.\n\n' +
  TOOL_LINES +
  '✏️ Pencil — mark up the score (stylus only; the tab appears when a pen is detected).';
