# Cluster 3: Tempo Ladder visual circles

Bugs covered: **B-020**, **B-021** from `BUGS.md`.

Two related but distinct rendering bugs on the Tempo Ladder play screen. B-020 affects the standard streak-dot row (Step + Cluster modes). B-021 affects the variable-size dot strip (Custom mode). Both are surgical fixes.

## Files to read before starting

- `hooks/useTempoLadderSession.ts` — `onClean`'s `hitTarget` branch fires `setCelebrating(...)` synchronously with the streak update, so the user never sees the final dot fill before the celebration modal covers it.
- `app/passage/[id]/tempo-ladder.tsx` — desktop streak-dot render (around line 521) and phone streak-dot render (around line 629). Both use `i < progress.current_streak` for fill. Logic is right; visibility timing is wrong.
- `components/CustomPatternDots.tsx` — variable-size dot strip for Custom mode. The `upcoming` style hardcodes `borderColor: '#ffffff99'`, which is invisible on the app's light theme.

## What changes for users

**B-020 — The final streak dot visibly fills before the celebration modal opens.** Today, when the user taps the rep that reaches the target (e.g., the 5th Clean in a 5-rep set), `current_streak` updates to 5 and `celebrating` becomes non-null in the same render pass. The celebration modal mounts on top of the dot row before the user perceives the 5th dot filling. The dot does fill in React state, but the modal hides it. Fix: delay the celebration by ~350 ms so the user gets a frame of "all five filled" before the modal covers the screen. The user-felt result is the satisfying "all green" moment the rep was supposed to give them.

**B-021 — Custom-mode upcoming dots are visible.** Today `CustomPatternDots`' `upcoming` style uses `borderColor: '#ffffff99'` — semi-transparent white — which is invisible on the light theme the practice screen uses. So as the user Cleans, the **green** filled dots appear one by one but the **hollow** upcoming dots that should sit beside them are missing. Ralph sees "green dots appearing in the right place" but no surrounding circle outline showing the rest of the pattern. Fix: replace the hardcoded white border with the theme's `icon` color (same source the standard streak dots use), so the upcoming-dot outlines read correctly on whichever theme is active.

## Code-level changes

### `hooks/useTempoLadderSession.ts`

In `onClean`, find the `hitTarget` branch. Today:

```ts
if (hitTarget) {
  setCompletedSets((n) => n + 1);
  lastHitTempoRef.current = progress.current_tempo;
  const reached =
    progress.mode === 'cluster'
      ? (progress.cluster_high ?? progress.goal_tempo) >= progress.goal_tempo
      : progress.current_tempo >= progress.goal_tempo;
  if (reached) reachedGoalRef.current = true;
  setProgress({ ...progress, current_streak: nextStreak });
  await updateTempoLadderState(exerciseId, progress.current_tempo, nextStreak);
  metronome.stop();
  setCelebrating({ reached });
  return;
}
```

(After Cluster 2's spec lands, the `updateTempoLadderState` call writes `durableBase(...)` instead of `progress.current_tempo` — keep that, don't regress it.)

Change the order so the streak update and metronome stop render first, then the celebration mounts a tick later:

```ts
if (hitTarget) {
  setCompletedSets((n) => n + 1);
  lastHitTempoRef.current = progress.current_tempo;
  const reached =
    progress.mode === 'cluster'
      ? (progress.cluster_high ?? progress.goal_tempo) >= progress.goal_tempo
      : progress.current_tempo >= progress.goal_tempo;
  if (reached) reachedGoalRef.current = true;
  setProgress({ ...progress, current_streak: nextStreak });
  const base = durableBase(progress.mode, progress.current_tempo, progress, customBase);
  await updateTempoLadderState(exerciseId, base, nextStreak);
  metronome.stop();
  // Give the user a beat (~350 ms) to see the final dot fill before the
  // celebration modal mounts. setCelebrating on the next tick lets React
  // commit the streak update first.
  setTimeout(() => setCelebrating({ reached }), 350);
  return;
}
```

Apply the same `setTimeout` wrap inside the custom-mode `hitTarget` branch earlier in `onClean`:

```ts
// All blocks done → completed pattern cleanly. Trigger celebration
// and let advanceAfterCelebration bump the base.
setCompletedSets((n) => n + 1);
lastHitTempoRef.current = customBase;
const newBase = Math.min(progress.goal_tempo, customBase + (progress.increment ?? 5));
const reached = newBase >= progress.goal_tempo;
if (reached) reachedGoalRef.current = true;
await updateCustomPosition(
  exerciseId,
  customBase,
  customPattern.blocks.length - 1,
  currentBlock.count - 1,
);
metronome.stop();
setTimeout(() => setCelebrating({ reached }), 350);
return;
```

Both branches keep their existing behavior in every other respect — the celebration modal still opens, just one paint cycle later.

### `components/CustomPatternDots.tsx`

This component currently imports nothing theme-aware. Add the colour-scheme hook so the upcoming-dot border picks up the active theme:

```ts
import { StyleSheet, View } from 'react-native';

import { expandPatternToReps, type CustomPattern } from '@/lib/strategies/customPatterns';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
```

Inside the component:

```ts
const scheme = useColorScheme() ?? 'light';
const themeIcon = Colors[scheme].icon;
```

Replace the static `upcoming` style block in the JSX. Today:

```tsx
return (
  <View
    key={i}
    style={[
      baseStyle,
      styles.upcoming,
      state === 'failed' && { borderColor: '#ffffff55' },
    ]}
  />
);
```

Change to:

```tsx
return (
  <View
    key={i}
    style={[
      baseStyle,
      styles.upcoming,
      { borderColor: themeIcon },
      state === 'failed' && { borderColor: themeIcon + '55' },
    ]}
  />
);
```

The hardcoded fail-state colour (`#ffffff55`) becomes a transparent version of the theme icon — same readability story as the upcoming state.

In the stylesheet at the bottom, drop the hardcoded `borderColor` from `upcoming` (it's now set inline):

```ts
upcoming: {
  borderWidth: 2,
  backgroundColor: 'transparent',
},
```

## Test plan (run on `playweb` after Terminal Claude finishes)

**B-020 — Step mode**

1. On a fresh passage, open Tempo Ladder. Set Base=60, Goal=120, Increment=5, Target reps=5.
2. Start. Tap Clean four times — four dots filled, fifth empty. Tap Clean a fifth time.
3. Watch the fifth dot. It should fill green for ~⅓ of a second BEFORE the "5 clean in a row!" celebration modal appears. **B-020 verified.**
4. Repeat at Target reps=10 and 20 to confirm the delay scales without feeling slow.

**B-020 — Custom mode**

1. On a fresh passage, open Tempo Ladder. Mode = Custom. Pick a saved pattern.
2. Start. Clean through every rep of the pattern.
3. On the final clean rep of the final block, watch the last dot fill green for a beat before "Pattern clean!" mounts.

**B-021 — Custom mode**

1. On a fresh passage, open Tempo Ladder. Mode = Custom. Pick a pattern with 6+ reps total (e.g., "9+1").
2. Start. Look at the dot strip at the top of the screen.
3. **Before tapping Clean at all:** you should see *all* dots as hollow circles with a visible (grey/dark) border. The variable sizing should be obvious — bigger dots for higher-tempo reps. **B-021 verified.**
4. Tap Clean once. The first dot becomes a solid green disc. The remaining hollow dots stay visible.
5. Switch to dark mode (system setting) and reload. Upcoming dots are still visible (now with a light border on a dark background).

**Regression check**

1. Run a Tempo Ladder Step mode session end to end. The standard streak dots (the ones using `C.icon` for the border) should look the same as before — no theme regression on them.

If anything fails, log a new bug. If all pass, mark B-020 and B-021 ✅ on laptop-web, then verify iphone-web and ipad-web on the live deploy. Native surfaces stay ➖ until cutover.

## What stays unchanged

- The CustomPatternDots variable-size scaling logic.
- The standard streak-dot rendering on desktop and phone (the `i < current_streak` fill check).
- The celebration modal content, the secondary "Step up tempo" action, and the goal-reached note prompt.
- The custom-mode `onClean` block-walking logic.
- `endSession`, `advanceAfterCelebration`, `onMiss`, all unchanged here.
- The Cluster 2 changes (don't regress the `durableBase` write or the `progress.increment` bump).

## After it ships

Same loop: `tsc --noEmit`, `npx expo export -p web`, smoke test locally, push, verify on three web surfaces, mark B-020 and B-021 squashed in the bug logger.
