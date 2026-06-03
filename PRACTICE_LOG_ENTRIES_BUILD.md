# Cluster 6: Practice log entries — Tempo Ladder reps + Rep Rotator session shape

Bugs covered: **B-004** (P2) and **B-018** (P0) from `BUGS.md`. Both surface in the per-passage practice log detail string. Same file, same render path, ship together.

## Files to read before starting

- `app/passage/[id]/history.tsx` — the per-passage practice log screen. `formatDetail()` (around line 91) is the single place that turns a log entry's `data_json` into the human-readable line shown under the strategy label. Both fixes live here.
- `hooks/useTempoLadderSession.ts` — `endSession()` (around line 466) writes Tempo Ladder log entries. The `data` object already includes `mode`, `completedSets`, and `patternName` for custom mode. We don't need to change what's written; we need to render what's already there.
- `app/interleaved.tsx` — Rep Rotator log writes happen here (`logPractice` calls at lines 431 and 942). Currently each passage in a rotation gets its own log entry with `mode`, `order`, `targetReps`, `streak`, `completed`, `tempo`. We need to also include the rotation's other passages so each entry reads as part of a session.
- `lib/db/repos/practiceLog.ts` and `.web.ts` — read for context. `data_json` is a JSON blob with no schema; new fields are non-breaking.

## What changes for users

**B-004 — Tempo Ladder log entries show mode + reps.** Today the detail line reads e.g. `"75 BPM · goal 120 · step"`. The `endSession` write already includes `completedSets` (and `patternName` for custom mode), but `formatDetail` doesn't render them. Fix: show the mode (Step / Cluster / Custom + pattern name) and the set count so the log entry tells the story of the session in one line — `"Step · 75 BPM · goal 120 · 3 sets"`, or `"Custom · My 9+1 · 80 BPM · goal 120 · 2 sets"`.

**B-018 — Rep Rotator entries identify themselves as session-level practice.** Today a Rep Rotator session writes one entry per passage to that passage's log, with a detail line like `"random · 65 BPM · 3/5 reps"`. The user can't tell from the per-passage log that this was part of a rotation with three other passages — it looks like a standalone practice of just that one passage. Fix: include the other passages' titles in each entry's `data_json` (a `sessionPassages: string[]` field) and render them in the detail string: `"Rep Rotator session · with Mozart, Brahms · 65 BPM · 3/5 reps"`. The user sees that this was part of a group and which group.

The bigger architectural idea Ralph floated (a separate session-level entity that aggregates passage entries) is deferred. The fix above gives the user-felt benefit without touching the schema.

## Code-level changes

### `app/passage/[id]/history.tsx`

**Tempo Ladder detail.** Find the `tempo_ladder` branch in `formatDetail`:

```ts
if (entry.strategy === 'tempo_ladder') {
  const parts: string[] = [];
  if (data.tempo) parts.push(`${data.tempo} BPM`);
  if (data.goalTempo) parts.push(`goal ${data.goalTempo}`);
  if (data.mode) parts.push(data.mode);
  return parts.join(' · ');
}
```

Replace with:

```ts
if (entry.strategy === 'tempo_ladder') {
  const parts: string[] = [];
  // Mode first — it's the strongest classifier and reads best as a lead.
  // Custom mode gets the pattern name attached so a saved pattern reads
  // as itself ("Custom · My 9+1") rather than the generic word "custom".
  if (data.mode === 'custom' && typeof data.patternName === 'string' && data.patternName) {
    parts.push(`Custom · ${data.patternName}`);
  } else if (typeof data.mode === 'string' && data.mode) {
    parts.push(data.mode.charAt(0).toUpperCase() + data.mode.slice(1));
  }
  if (data.tempo) parts.push(`${data.tempo} BPM`);
  if (data.goalTempo) parts.push(`goal ${data.goalTempo}`);
  if (typeof data.completedSets === 'number' && data.completedSets > 0) {
    parts.push(`${data.completedSets} ${data.completedSets === 1 ? 'set' : 'sets'}`);
  }
  return parts.join(' · ');
}
```

Notes on the change:
- `mode` moves to the front and gets capitalized so it reads as a label rather than a stray word.
- Custom mode shows the pattern name explicitly. The `patternName` field is already written by `endSession` in `useTempoLadderSession.ts`.
- `completedSets` only renders when > 0 so a zero-work session doesn't display "0 sets."

**Rep Rotator (Interleaved) detail.** Find the `interleaved` branch:

```ts
if (entry.strategy === 'interleaved') {
  const parts: string[] = [];
  if (data.mode) parts.push(data.mode);
  if (typeof data.tempo === 'number') parts.push(`${data.tempo} BPM`);
  if (data.completed) parts.push('completed ✓');
  else if (data.streak != null && data.targetReps)
    parts.push(`${data.streak}/${data.targetReps} reps`);
  return parts.join(' · ');
}
```

Replace with:

```ts
if (entry.strategy === 'interleaved') {
  const parts: string[] = ['Rep Rotator session'];
  // List the OTHER passages in the rotation so the user reading this passage's
  // log knows it was part of a group session and which group. Trim to the
  // first 3 names so the line doesn't blow out on a 10-passage rotation.
  if (Array.isArray(data.sessionPassages) && data.sessionPassages.length > 0) {
    const names = data.sessionPassages.filter((n: unknown): n is string => typeof n === 'string' && n.length > 0);
    if (names.length > 0) {
      const shown = names.slice(0, 3).join(', ');
      const more = names.length > 3 ? ` +${names.length - 3} more` : '';
      parts.push(`with ${shown}${more}`);
    }
  }
  if (typeof data.tempo === 'number') parts.push(`${data.tempo} BPM`);
  if (data.completed) parts.push('completed ✓');
  else if (data.streak != null && data.targetReps) {
    parts.push(`${data.streak}/${data.targetReps} reps`);
  }
  return parts.join(' · ');
}
```

The label moves from the bare `data.mode` ("random") to a self-describing "Rep Rotator session." The `sessionPassages` listing is the new affordance Ralph asked for.

### `app/interleaved.tsx`

**Write `sessionPassages` into each log entry.** Find both `logPractice` calls (around line 431 and 942). Each lives inside a `for (const spot of spots) { ... }` loop. Before the loop, compute the rotation's passage titles once:

```ts
// Build the list of OTHER passages in the rotation for each entry's
// data_json so the per-passage log can show "with Mozart, Brahms" on a
// session entry. Each entry skips its own passage from the list.
const allTitles: string[] = spots.map((s) => s.passage.title);
```

Then inside the loop, before the `await logPractice(...)` call, set `sessionPassages` on `data`:

```ts
for (const spot of spots) {
  try {
    await stampLastUsed(spot.passage.id, 'interleaved');
    const data: Record<string, unknown> = {
      mode,
      order,
      targetReps,
      streak: spot.streak,
      completed: spot.completed,
    };
    const tempo = engagedTempoMap.current.get(spot.passage.id);
    if (tempo != null) data.tempo = tempo;
    if (mood) data.mood = mood;
    if (note) data.note = note;
    if (remindNext) data.remindNext = true;
    // List the OTHER passages in this rotation. Skip self so the user
    // doesn't read "with this passage" on its own log line.
    const others = allTitles.filter((t) => t !== spot.passage.title);
    if (others.length > 0) data.sessionPassages = others;
    await logPractice(spot.passage.id, 'interleaved', data);
  } catch {
    // ignore — keep navigation flowing
  }
}
```

Apply the same change in **both** places — the lines around 431 and 942. They're parallel code paths (one for the goal-reached celebration, one for the End-with-progress path) and need to stay in sync.

Edge case: if two passages in the rotation happen to share the same title, `filter((t) => t !== spot.passage.title)` will drop both — fix by filtering on the passage ID instead:

```ts
const others = spots
  .filter((s) => s.passage.id !== spot.passage.id)
  .map((s) => s.passage.title);
if (others.length > 0) data.sessionPassages = others;
```

This is the safer form; use it.

### What about old log entries?

Existing entries written before this change don't have `sessionPassages` in `data_json`. `formatDetail` already guards on `Array.isArray(data.sessionPassages) && data.sessionPassages.length > 0` — old entries fall through to the old behaviour minus the leading "Rep Rotator session" label. That's fine — they'll still read as a Rep Rotator session because of the static label; they just won't list other passages.

If you want old entries to also display the new label, that's already happening — the leading `parts: string[] = ['Rep Rotator session']` line applies to every interleaved entry regardless of `data_json` contents.

## Test plan (run on `playweb` after Terminal Claude finishes)

**B-004 — Tempo Ladder**

1. On a fresh passage, open Tempo Ladder. Mode = Step. Base=60, Goal=120, Increment=5, Target reps=5. Tap Clean five times to complete a set. End the session and write a quick note in the prompt.
2. Open the per-passage practice log (History). The newest entry should read something like `"Step · 65 BPM · goal 120 · 1 set"`.
3. Repeat with Cluster mode. Detail line reads `"Cluster · 68 BPM · goal 120 · 1 set"` (BPM varies per random pick).
4. Repeat with Custom mode using a saved pattern called "Test pattern". Detail line reads `"Custom · Test pattern · 60 BPM · goal 120 · 1 set"`.
5. **B-004 verified** when mode (capitalised), pattern name (for custom), and set count are all visible.

**B-018 — Rep Rotator**

1. Open the library. Hit 🔀 Rep Rotator. Pick three passages (e.g. "Passage A," "Passage B," "Passage C"). Set target reps small (5) to finish fast. Start the rotation. Clean through enough reps to log progress on each.
2. End the session. Write a note if prompted.
3. Open the per-passage log for "Passage A". The newest entry should read `"Rep Rotator session · with Passage B, Passage C · 65 BPM · 5/5 reps"` (or similar — the names of the OTHER two passages, not A itself).
4. Open the per-passage log for "Passage B". Same shape but listing A and C.
5. Run a rotation with 5+ passages. Detail line should clip at 3 names with `+2 more` appended.
6. **B-018 verified.**

**Regression**

1. Old Tempo Ladder entries (pre-fix) still render — they have `data.tempo`, `data.goalTempo`, `data.mode` but not `completedSets`. They should show mode + tempo + goal without the set count.
2. Old interleaved entries still render — they should pick up the new "Rep Rotator session" label automatically because that label is unconditional now. They won't show the "with X, Y" middle clause because `sessionPassages` isn't in their data.
3. Other strategy detail lines (Click-Up, Recording) are untouched.

Log any failures as new bugs. On full pass, mark B-004 and B-018 ✅ on laptop-web, push, verify iphone-web + ipad-web on live, mark squashed in the bug logger.

## What stays unchanged

- The `practice_log` SQL table and `data_json` schema (it's a JSON blob; we're adding a field, not changing structure).
- The Tempo Ladder write path — `endSession` already includes `completedSets` and `patternName` in `data_json`. We're just rendering them.
- All other strategies in `formatDetail` (click_up, recording, etc.).
- The strategy label color logic, the entry edit/delete flows, the mood/note display.
- The per-document and library-wide log screens that share `formatDetail` — they pick up the same improved detail strings for free.

## After it ships

Same loop: `tsc --noEmit`, `npx expo export -p web`, smoke test locally, push, verify the three web surfaces, mark B-004 and B-018 squashed in the bug logger.

After Cluster 6, 8 bugs remain: B-022 (P0 arrow keys, needs investigation), B-023 (P0 PDF title overlay), B-024 (P0 library search scope), B-001 (P1 library root rename), B-002 (P1 iPhone PWA scroll — deferred), B-006/B-009/B-011 (P2 polish). The remaining P0s are all standalone or pair into a thin cluster (B-022 + B-024 both touch library/keyboard behaviour); we'll pick the next batch based on what's quickest after this lands.
