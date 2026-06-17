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
    '🥁 Metronome — tempo, meter, subdivisions, drum grooves, drone, and random gaps.\n' +
    '🪜 Tempo Ladder — climb the tempo with Step, Cluster, or your saved Custom patterns.\n' +
    '🎵 Rhythm Variations — practice with different rhythm patterns against the click.\n' +
    '🌐 Community Library — browse and download rhythm exercises shared by other players.\n\n' +
    'Tap any card to begin. To tie a tool to specific music and save your progress, open a passage from the library instead.',
};

export const TOOLS_METRONOME_HELP: ToolsHelp = {
  title: 'Metronome',
  body:
    'A standalone metronome, front and centre. Use it to:\n\n' +
    '• Set the tempo — type it, use −/+, or TAP TEMPO to the beat.\n' +
    '• Pick a meter and which beats are accented (tap the dots).\n' +
    '• Choose a subdivision — eighths, triplets, sixteenths.\n' +
    '• Turn on RHYTHMS to swap the plain click for a drum-machine groove that matches your meter.\n' +
    '• Turn on DRONE for a steady pitch underneath the click to tune against.\n' +
    '• Turn on GAPS to randomly silence a share of the beats (10–80%, beat 1 included) so you keep time on your own.\n\n' +
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
