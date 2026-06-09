// Help copy for the library "Tools" hub and its tools-mode screens.
//
// Each entry feeds a <TutorialStep> (title + body): the global "?" button
// shows it on demand, and it auto-fires once-ever the first time a user opens
// that tool. These are distinct from the in-a-passage strategy tutorials
// because the tools versions show no sheet music and save nothing.

export type ToolsHelp = { title: string; body: string };

export const TOOLS_HUB_HELP: ToolsHelp = {
  title: 'Practice tools',
  body:
    'These tools work on their own — no piece of music needed, and nothing is saved to your practice log. They’re for warming up and drilling technique.\n\n' +
    '🥁 Metronome — tempo, meter, subdivisions, and drum grooves.\n' +
    '🪜 Tempo Ladder — climb the tempo with Step, Cluster, or your saved Custom patterns.\n' +
    '🎵 Rhythm Variations — practice with different rhythm patterns against the click.\n' +
    '⏱ Interleaved Click-Up — drill small units at climbing tempos, guided by on-screen prompts.\n\n' +
    'Tap any card to begin. To tie a tool to specific music and save your progress, open a passage from the library instead.',
};

export const TOOLS_METRONOME_HELP: ToolsHelp = {
  title: 'Metronome',
  body:
    'A standalone metronome, front and centre. Use it to:\n\n' +
    '• Set the tempo — type it, use −/+, or TAP TEMPO to the beat.\n' +
    '• Pick a meter and which beats are accented (tap the dots).\n' +
    '• Choose a subdivision — eighths, triplets, sixteenths.\n' +
    '• Turn on RHYTHMS to swap the plain click for a drum-machine groove that matches your meter.\n\n' +
    'Nothing here is saved — it’s just a click whenever you need one.',
};

export const TOOLS_TEMPO_LADDER_HELP: ToolsHelp = {
  title: 'Tempo Ladder',
  body:
    'Climb the metronome gradually. Pick a mode, set your start and goal tempos, then mark each rep Clean ✓ or Miss ✗ — the tempo bumps up as you succeed. Start well below your target (often half) so the early reps are mistake-proof.\n\n' +
    'Step — bumps up after a number of clean reps in a row. The best place to start.\n\n' +
    'Cluster — each rep is a random tempo inside a band, so you never know what’s coming. Keeps you sharp.\n\n' +
    'Custom — your own sequence (e.g. 9 reps at base + 1 at base+10). The patterns saved to your account show up here; tap + Build a custom pattern to make one.\n\n' +
    'This is the tools version: no piece of music on screen, and nothing is saved — it’s for warming up or drilling by ear. Open a passage from the library if you want it to remember your progress.',
};

export const TOOLS_RHYTHMIC_HELP: ToolsHelp = {
  title: 'Rhythm Variations',
  body:
    'Practice with a different rhythm pattern each time — dotted, swung, reversed — to even out your technique and expose weak spots that playing as written can hide.\n\n' +
    'Pick a note grouping (how many notes are in one beat or chunk). The big staff in the middle shows the current pattern: tap ▶ Loop to hear it (■ Stop to silence it), and ← Prev / Next → to move through the library. Use the N-note ▾ chip up top to switch groupings.\n\n' +
    'This is the tools version: no piece of music on screen, and nothing is saved. Open a passage from the library if you want it tied to specific music.',
};

export const TOOLS_CLICK_UP_HELP: ToolsHelp = {
  title: 'Interleaved Click-Up',
  body:
    'A research-backed way to drill a passage, developed by Molly Gebrian. Break your passage into small units in your head — a beat or a measure each — then tell the app how many units you have and your tempo range.\n\n' +
    'The app walks you through the units the interleaved way: one at a time first, then growing combinations, climbing the tempo. It tells you exactly what to play at each step ("Play unit 1", "Now play units 1 and 2"…). Tap Next → after each repetition (a foot pedal or the Space bar also works), and ← Back to revisit the previous step.\n\n' +
    'This is the tools version — guided by text, with no music on screen and nothing saved. To mark units on your actual sheet music and save your progress, open a passage and choose Interleaved Click-Up there.',
};
