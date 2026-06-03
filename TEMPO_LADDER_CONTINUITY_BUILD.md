# Cluster 2: Tempo Ladder session continuity + correct completion %

Bugs covered: **B-010**, **B-019** from `BUGS.md`.

Both bugs live in the same hook (`useTempoLadderSession`) and stem from the same root cause: at session end and during cluster mode, `current_tempo` gets written with whatever the metronome is currently showing — which in cluster mode is the random pick of the moment, and in custom mode is the active block's tempo. That makes the library "tempo ladder %" indicator wrong (B-019), and the between-session bump uses a hardcoded 5 BPM instead of the user's chosen increment (B-010).

## Files to read before starting

- `hooks/useTempoLadderSession.ts` — owns `startSession`, `onClean`, `onMiss`, `advanceAfterCelebration`, `endSession`. All the writes that produce these bugs live here.
- `lib/db/repos/tempoLadder.ts` and `.web.ts` — confirm what fields `updateTempoLadderState`, `updateCustomPosition`, `advanceClusterWindow`, and `updateTempoLadderConfigBounds` write. Both sibling files have to stay signature-compatible.
- `lib/db/repos/passageStatus.ts` and `.web.ts` — the SQL that derives the library's tempo-ladder % from `current_tempo / goal_tempo`. Read but don't change.
- `app/passage/[id]/tempo-ladder.tsx` — the screen that consumes `progress.current_tempo` for the celebration modal's "next preview" text. Confirms no UI surface breaks if cluster mode's React-state `current_tempo` continues to be the random pick.

## What changes for users

**B-010 — Between-session bump uses the user's increment, not a hardcoded 5.** Today the constant `SUCCESS_BUMP_BPM = 5` is added to `start_tempo` (and to `cluster_low` in cluster mode) in `endSession` when the user reached goal. If the user set Increment = 10, they expect a 10 BPM bump for the next session; they get 5. Fix: replace every use of `SUCCESS_BUMP_BPM` in `endSession` with `progress.increment ?? 5`.

**B-019 — Library "tempo ladder %" reflects the durable base, not the live metronome BPM.** Today the library list shows `current_tempo / goal_tempo` as a percent. In step mode that's correct — `current_tempo` equals the ladder rung the user is on. In **cluster** mode `current_tempo` is the random pick inside `[cluster_low, cluster_high]`, so the percent jumps around between reps and ends wherever the last roll happened to land. In **custom** mode `current_tempo` is whatever block tempo the user happened to be on at End, which can be far above their actual base. The user's real "ladder position" is `cluster_low` (cluster) or `customBase` (custom). Fix: at end-of-session and at every mid-session storage write, persist the durable base, not the live metronome BPM.

The React state `progress.current_tempo` in cluster mode still tracks the live metronome pick (the screen reads it to drive the metronome's displayed BPM and the random-pick chip). Only the **persisted** column gets the durable base. The screen's `nextPreviewTempo` calc is gated by `progress.mode === 'cluster' ? null : ...`, so it isn't affected.

## Code-level changes

### `hooks/useTempoLadderSession.ts`

**Helper near the top of the file.** Add a small helper just below the `SUCCESS_BUMP_BPM` constant (which becomes obsolete but leave it deprecated-but-present for any external import for one revision):

```ts
function durableBase(
  mode: Mode,
  metronomeBpm: number,
  progress: TempoLadderProgress | null,
  customBase: number,
): number {
  if (!progress) return metronomeBpm;
  if (mode === 'cluster') return progress.cluster_low ?? progress.start_tempo;
  if (mode === 'custom') return customBase;
  return metronomeBpm; // step
}
```

This is the single place that encodes "what's the user's real ladder position." Use it for every write.

**`endSession`.** Replace the existing post-session write and bump block. The current code reads:

```ts
const bpm = metronome.bpm;
await updateTempoLadderState(exerciseId, bpm, progress?.current_streak ?? 0);
```

Change to:

```ts
const base = durableBase(progress?.mode ?? 'step', metronome.bpm, progress, customBase);
await updateTempoLadderState(exerciseId, base, progress?.current_streak ?? 0);
```

Then the bump block. The current code uses `SUCCESS_BUMP_BPM` (hardcoded 5):

```ts
if (reachedGoalRef.current && progress) {
  const maxStart = progress.goal_tempo - SUCCESS_BUMP_BPM;
  const newStart = Math.min(progress.start_tempo + SUCCESS_BUMP_BPM, maxStart);
  ...
  const newLow = Math.min(oldLow + SUCCESS_BUMP_BPM, maxLow);
  ...
}
```

Replace every `SUCCESS_BUMP_BPM` with `(progress.increment ?? 5)`:

```ts
if (reachedGoalRef.current && progress) {
  const bump = progress.increment ?? 5;
  const maxStart = progress.goal_tempo - bump;
  const newStart = Math.min(progress.start_tempo + bump, maxStart);
  const fields: { start_tempo?: number; cluster_low?: number } = {};
  if (newStart > progress.start_tempo) fields.start_tempo = newStart;
  if (progress.mode === 'cluster') {
    const oldLow = progress.cluster_low ?? progress.start_tempo;
    const maxLow = (progress.cluster_high ?? progress.goal_tempo) - bump;
    const newLow = Math.min(oldLow + bump, maxLow);
    if (newLow > oldLow) fields.cluster_low = newLow;
  }
  if (fields.start_tempo !== undefined || fields.cluster_low !== undefined) {
    await updateTempoLadderConfigBounds(exerciseId, fields);
  }
}
```

**`onClean` — cluster mode mid-session write.** The current code in the cluster branch of `onClean` reads:

```ts
if (progress.mode === 'cluster') {
  const lo = progress.cluster_low ?? progress.start_tempo;
  const hi = progress.cluster_high ?? progress.goal_tempo;
  const nextTempo = pickRandom(lo, hi);
  setProgress({ ...progress, current_tempo: nextTempo, current_streak: nextStreak });
  metronome.setBpm(nextTempo);
  await updateTempoLadderState(exerciseId, nextTempo, nextStreak);
  await stampLastUsed(id, 'tempo_ladder');
  return;
}
```

The React-state `current_tempo: nextTempo` and `metronome.setBpm(nextTempo)` lines stay — those drive the UI and the audio. Only the **storage** write changes:

```ts
await updateTempoLadderState(exerciseId, lo, nextStreak);
```

Write the durable base (`cluster_low`), not the random pick.

**`onClean` — step mode mid-set persistence.** Step mode at the bottom of `onClean`:

```ts
setProgress({ ...progress, current_streak: nextStreak });
await updateTempoLadderState(exerciseId, progress.current_tempo, nextStreak);
```

No change — in step mode `current_tempo` IS the ladder position.

**`onClean` — hitTarget branch.** When a set completes (`hitTarget`), the current code writes:

```ts
await updateTempoLadderState(exerciseId, progress.current_tempo, nextStreak);
```

For step mode this is correct (`current_tempo` is the rung). For cluster mode this also writes the random pick — change it to write the durable base:

```ts
const base = durableBase(progress.mode, progress.current_tempo, progress, customBase);
await updateTempoLadderState(exerciseId, base, nextStreak);
```

**`onMiss` — cluster path.** The cluster branch reads:

```ts
setProgress({ ...progress, current_streak: 0 });
await updateTempoLadderState(exerciseId, progress.current_tempo, 0);
```

Same fix:

```ts
const base = durableBase(progress.mode, progress.current_tempo, progress, customBase);
await updateTempoLadderState(exerciseId, base, 0);
```

**`advanceAfterCelebration` — cluster branch.** The cluster branch writes via `advanceClusterWindow(exerciseId, newLo, newHi, nextTempo, 0)` — this writes the new cluster window plus a `current_tempo` of `nextTempo` (random pick within new window). Change the call to pass `newLo` instead of `nextTempo`:

```ts
await advanceClusterWindow(exerciseId, newLo, newHi, newLo, 0);
```

If `advanceClusterWindow`'s 3rd argument isn't named "current_tempo" / "tempo," confirm by reading `lib/db/repos/tempoLadder.ts` and adjust. The intent: persist `newLo` as the row's `current_tempo`.

**`advanceAfterCelebration` — step branch.** Reads:

```ts
const nextTempo = Math.min(progress.goal_tempo, progress.current_tempo + (progress.increment ?? 5));
setProgress({ ...progress, current_tempo: nextTempo, current_streak: 0 });
metronome.setBpm(nextTempo);
await updateTempoLadderState(exerciseId, nextTempo, 0);
```

No change. Step mode's `current_tempo` is the rung.

**`advanceAfterCelebration` — custom branch.** Already writes `newBase` via `updateCustomPosition(exerciseId, newBase, 0, 0)`. No change needed.

### `lib/db/repos/passageStatus.ts` and `.web.ts`

**No change.** The SQL `current_tempo / goal_tempo` is the right formula once `current_tempo` reliably represents the durable base. Reading these files in advance is for understanding only.

### `app/passage/[id]/tempo-ladder.tsx`

**No change.** The `nextPreviewTempo` calc:

```ts
const nextPreviewTempo =
  progress.mode === 'cluster'
    ? null
    : progress.mode === 'custom'
      ? Math.min(progress.goal_tempo, customBase + (progress.increment ?? 5))
      : Math.min(progress.goal_tempo, progress.current_tempo + (progress.increment ?? 5));
```

The cluster branch returns `null` (no preview shown for cluster), the custom branch uses `customBase`, and the step branch uses `current_tempo` — which is still the rung in React state. All three remain correct.

Confirm by reading lines 460–472 of this file. If anything else in the screen reads `progress.current_tempo` for cluster mode and would be confused by a base value, flag it — but the screen's cluster-mode UI mostly reads `progress.cluster_low` / `cluster_high` directly, not `current_tempo`.

## Test plan (run on `playweb` after Terminal Claude finishes)

Set up two passages so you can test fresh without overwriting your existing tempo-ladder progress.

**Test passage A: step mode + custom increment.**

1. On a fresh passage, open Tempo Ladder. Set Base=60, Goal=120, Increment=10, Target reps=5.
2. Start. Tap Clean 5× at 60. Celebration fires. Continue: 70 → 80. Tap Clean 5× at 80 to advance to 90. End the session.
3. Return to the library. The passage should show a tempo-ladder % around `90/120 = 75%`. Reload the page. Same %.
4. Re-enter Tempo Ladder. Base should show **90**, not 60. (current_tempo carried forward — already worked.) Goal still 120, Increment still 10.
5. Continue: 90 → 100 → 110 → 120. Celebration fires with "You reached your goal tempo of 120 BPM." End.
6. **Library %: 100%.**
7. Re-enter Tempo Ladder. Base should show **70** (60 + 10), not 65 (which was the old hardcoded +5). Goal still 120. **B-010 verified.**

**Test passage B: cluster mode.**

1. On a fresh passage, open Tempo Ladder. Mode = Cluster. Cluster low=60, Cluster high=72, Goal=120, Increment=5, Target reps=5.
2. Start. Library shows the % at this moment. Note the value.
3. Tap Clean a few times within a set — metronome jumps around 60–72 (random picks).
4. Open the library in another tab without ending the session. The % should be `60/120 = 50%`, NOT bouncing with each random pick. **B-019 verified for cluster.**
5. Finish the set (5 Clean). Celebration fires. Advance: cluster slides to 65–77. Tap End.
6. Reload library. % should be `65/120 ≈ 54%`. Not bouncing.

**Test passage C: custom mode (only if you have a custom pattern saved).**

1. On a fresh passage, open Tempo Ladder. Mode = Custom. Pick a pattern with blocks at Base+5 / Base+10. Set Base=60, Goal=120, Increment=10.
2. Start. The metronome plays through the blocks (60, 65, 70, etc.).
3. Mid-block, hit End without completing the pattern.
4. Reload library. The % should reflect **60/120 = 50%** (your customBase), not 70/120 (an inflated block tempo).
5. **B-019 verified for custom.**

If any of those checks fail, log a new bug. If all pass, mark B-010 and B-019 as fixed on laptop-web in the bug logger, then verify iphone-web + ipad-web on the live deploy, same as Cluster 1.

## What stays unchanged

- The DB schema (`tempo_ladder_progress` columns) and the storage repos' function signatures.
- The React state shape returned by the hook. Outside callers (the screen) keep reading the same fields.
- Step mode behavior end-to-end.
- The metronome's displayed BPM in cluster mode (still the random pick — that's what the user practices to).
- Custom mode's per-block scheduling.
- The celebration modal copy and trigger logic.

## After it ships

Same routine as Cluster 1. `tsc --noEmit`, `npx expo export -p web`, smoke test locally, push, verify on three web surfaces, mark B-010 and B-019 squashed in the bug logger. Leave the native surfaces ➖ untested until iPad cutover.
