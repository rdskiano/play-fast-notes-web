// "Tools only" mode — the practice tools (Tempo Ladder, Rhythm Variations)
// reached from the library's Tools hub instead of from a specific passage.
//
// The tool screens normally read a real passage `id` from the route and use
// it to (a) show the sheet music as a backdrop and (b) save progress /
// practice-log rows keyed to that piece. In Tools mode there is no piece:
// the screens are launched at the route `/passage/<TOOLS_ONLY_ID>/<tool>`,
// run with a blank backdrop, and skip every passage-keyed read/write. The
// tool's own mechanics (the metronome, the tempo ladder, the rhythm
// patterns) are self-contained, so nothing else changes.
//
// We piggy-back on the existing `/passage/[id]/<tool>` routes rather than
// duplicating those large screens — a sentinel id is the lightest way to
// flag "no piece" without a parallel route tree.

export const TOOLS_ONLY_ID = '__tools__';

export function isToolsOnly(id?: string | null): boolean {
  return id === TOOLS_ONLY_ID;
}
