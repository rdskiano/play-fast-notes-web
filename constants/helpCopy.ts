// Shared help-modal copy. Strings here are surfaced by the global "?"
// button via <TutorialStep>. Keeping the cross-screen blocks in one
// place stops them drifting apart as screens are added.

// The floating practice tools (PracticeToolsLayer) appear on every
// score-viewing and practice screen. Append this block to those screens'
// help bodies so the "?" always explains the dock. Not every screen
// mounts every tool, so the copy is deliberately general.
export const PRACTICE_TOOLS_HELP =
  'Practice tools: tap a tab on the edge of the screen to pop out a tool — drag it to reposition, pinch to resize, tap the tab again to dock it.\n\n' +
  '🥁 Metronome — play/stop, set the tempo, meter, and subdivision, and tap out beat accents. Tap RHYTHMS to swap the plain click for a drum groove matched to your meter (rock, waltz, etc.).\n' +
  '⏱ Timers — optional nudges to rotate passages, take a micro-break, play it cold, or move your body.\n' +
  '🎤 Recorder — capture a take and play it back; saved takes attach to your practice log.\n' +
  '✏️ Pencil — mark up the score (stylus only; the tab appears when a pen is detected).';
