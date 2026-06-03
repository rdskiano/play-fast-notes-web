# Cluster 4: Rhythm + metronome sync + spacebar advance

Bugs covered: **B-007**, **B-008**, **B-017** from `BUGS.md`.

Three bugs in the rhythm + metronome audio path. All shipped together because they live in the same files (`useMetronome.web.ts` for the audio scheduling, `app/passage/[id]/rhythmic.tsx` for the keyboard binding).

## Files to read before starting

- `lib/audio/useMetronome.web.ts` — already contains `computePitchStartTime` (the helper that aligns the pitch-rhythm scheduler to the next metronome downbeat). That's the reference pattern to mirror.
- `lib/audio/useMetronome.ts` — native sibling. Must stay signature-compatible with the web hook even if native doesn't get the alignment work yet.
- `lib/audio/metronomeEngine.ts` — native engine. Read but don't change unless type parity forces it.
- `app/passage/[id]/rhythmic.tsx` — Rhythmic Variation flow. `onNext` exists at line 169 and is wired to `FloatingRhythmCard`'s Next → button. The keyboard binding for B-008 hooks into the existing `onNext`.
- `components/PedalCatcher.web.tsx` — already provides keyboard advance plumbing on other practice screens (Tempo Ladder, Click-Up). Reuse it here.

## What changes for users

**B-017 — Loop rhythm starts on the metronome's next downbeat.** Today `startRhythmLoop` schedules its first note at `ctx.currentTime + 0.08`, regardless of whether the metronome is already clicking. If the user is in the Rhythmic Variation flow, has the metronome running, and presses **▶ Loop rhythm** on the floating card, the loop's first note lands wherever 80 ms of latency puts it — out of phase with the click. Fix: when the metronome is already running, schedule the loop's first note at the next metronome downbeat (mirror what `computePitchStartTime` already does for the pitch-rhythm scheduler).

**B-007 — Metronome started after exercise/loop is already playing aligns to it.** Today the metronome's `start()` sets `nextNoteTimeRef.current = ctx.currentTime + 0.05`, no matter what else is playing. If the user has a Rhythm Builder exercise (`playPitchRhythm`) or a rhythm loop (`startRhythmLoop`) already running and then hits **PLAY** on the metronome, the click drops in wherever it lands — out of phase with the exercise. Fix: when the metronome's `start()` fires while a pitch sequence or rhythm loop is active, align the first metronome tick to that stream's next "perceived downbeat" (the next time the loop wraps to its first token, or — for one-shot pitch sequences — the next pitch note that begins a chunk).

**B-008 — Spacebar advances to the next rhythm on the Rhythmic Variation screen.** Today the floating rhythm card has a **Next →** button, but the screen has no keyboard binding. On laptop the user is reaching for the trackpad every time. Fix: add a `PedalCatcher` to the rhythmic screen that calls the existing `onNext` on Space / Enter / Page Down / ArrowDown (same shortcuts the other practice screens already use), gated to the rhythm-patterns mode of the screen.

## Code-level changes

### `lib/audio/useMetronome.web.ts`

**Add a helper that mirrors `computePitchStartTime` for the rhythm loop.** Place it next to `computePitchStartTime`:

```ts
// If the metronome is currently clicking, align the rhythm loop's first
// note with the next metronome downbeat (beat 1 of the next measure).
// Otherwise, default to ~80 ms ahead like before.
function computeRhythmStartTime(ctx: AudioContext): number {
  const defaultStart = ctx.currentTime + 0.08;
  if (!runningRef.current) return defaultStart;
  const sub = subRef.current;
  const beats = beatPatternRef.current.length;
  if (sub <= 0 || beats <= 0) return defaultStart;
  const ticksPerMeasure = beats * sub;
  const tickSec = 60 / bpmRef.current / sub;
  const idx = ((subStepRef.current % ticksPerMeasure) + ticksPerMeasure) % ticksPerMeasure;
  const ticksTilDownbeat = idx === 0 ? 0 : ticksPerMeasure - idx;
  let downbeat = nextNoteTimeRef.current + ticksTilDownbeat * tickSec;
  while (downbeat < ctx.currentTime + 0.05) {
    downbeat += ticksPerMeasure * tickSec;
  }
  return downbeat;
}
```

**Use it in `startRhythmLoop`.** Replace the current hard-coded start time:

```ts
function startRhythmLoop(tokens: RhythmToken[], beatDenominator = 4) {
  if (tokens.length === 0) return;
  stopRhythmLoop();
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  const gate = ctx.createGain();
  gate.gain.value = 1;
  gate.connect(ctx.destination);
  rhythmGateRef.current = gate;
  rhythmTokensRef.current = tokens.slice();
  rhythmBeatDenomRef.current = beatDenominator;
  rhythmTokenIdxRef.current = 0;
  rhythmNextStartRef.current = computeRhythmStartTime(ctx);  // ← change
  setRhythmLooping(true);
  rhythmTick();
}
```

**Align the metronome `start()` to the active pitch/rhythm stream.** Find the metronome `start()` function (around line 370 — the one that sets `nextNoteTimeRef.current = c.currentTime + 0.05` and `subStepRef.current = 0`). Add a helper right before it:

```ts
// If a pitch sequence or rhythm loop is already playing, align the
// metronome's first tick to that stream's next perceived downbeat so the
// click drops in on phase. Returns ctx.currentTime + 0.05 (the existing
// default) when nothing else is playing.
function computeMetronomeStartTime(ctx: AudioContext): number {
  const defaultStart = ctx.currentTime + 0.05;
  // Rhythm loop active: its downbeat is the next time token index 0 fires.
  // rhythmNextStartRef points at the next-scheduled note in the cycle. The
  // *next downbeat* is rhythmNextStartRef plus the durations of remaining
  // tokens in the current cycle (from the current token index onward to
  // the wrap-back to 0).
  if (rhythmTokensRef.current && rhythmGateRef.current) {
    const tokens = rhythmTokensRef.current;
    const beatDenom = rhythmBeatDenomRef.current;
    const secondsPerQuarter = (60 / bpmRef.current) * (beatDenom / 4);
    let t = rhythmNextStartRef.current;
    if (rhythmTokenIdxRef.current === 0) {
      // Already at a downbeat — that's the alignment target.
      while (t < ctx.currentTime + 0.05) {
        // Walk a full cycle forward if the upcoming downbeat is too soon
        // to schedule reliably.
        let cycleSec = 0;
        for (const tok of tokens) cycleSec += TOKEN_QUARTER_FRACTIONS[tok] * secondsPerQuarter;
        t += cycleSec;
      }
      return t;
    }
    // Walk from the current token index forward to the wrap.
    for (let i = rhythmTokenIdxRef.current; i < tokens.length; i++) {
      t += TOKEN_QUARTER_FRACTIONS[tokens[i]] * secondsPerQuarter;
    }
    while (t < ctx.currentTime + 0.05) {
      let cycleSec = 0;
      for (const tok of tokens) cycleSec += TOKEN_QUARTER_FRACTIONS[tok] * secondsPerQuarter;
      t += cycleSec;
    }
    return t;
  }
  // Pitch sequence active: align to the next scheduled pitch note. Pitch
  // sequences are one-shot, so "downbeat" means "next pitch" — that's the
  // closest thing to a perceived strong beat for an unfolding melody.
  if (pitchFreqsRef.current && pitchTokensRef.current && pitchGateRef.current) {
    let t = pitchNextStartRef.current;
    if (t < ctx.currentTime + 0.05) {
      // The next pitch is too close to align reliably — fall through to
      // the default behaviour rather than landing on a stale note.
      return defaultStart;
    }
    return t;
  }
  return defaultStart;
}
```

In `start()`, replace:

```ts
nextNoteTimeRef.current = c.currentTime + 0.05;
subStepRef.current = 0;
```

with:

```ts
nextNoteTimeRef.current = computeMetronomeStartTime(c);
subStepRef.current = 0;
```

Verify the same change isn't needed at the resync-clause inside the scheduler loop (the one that resets when the AudioContext fell behind by half a second). Leave that alone — it's the catch-up path, not the start path.

### `app/passage/[id]/rhythmic.tsx`

Find `onNext` at around line 169. Above it, in the same component, add the keyboard catcher. Use the existing `PedalCatcher`:

```tsx
import { PedalCatcher } from '@/components/PedalCatcher';
```

Then mount it inside the return, at the same level as `FloatingRhythmCard`:

```tsx
<PedalCatcher
  active={!notePromptVisible /* or whatever modal state guards exist */}
  onAdvance={onNext}
/>
```

Read the surrounding screen state to find the right `active` gate — copy the pattern from `app/passage/[id]/tempo-ladder.tsx` (which gates on `!notePromptVisible && celebrating === null`). The point is: the catcher should be silent while modals are showing, but live during the rhythm-patterns flow.

If `notePromptVisible` etc. don't exist on this screen, just `active={true}` — `PedalCatcher` already has typing-target protection (inputs/textareas don't fire).

### `lib/audio/useMetronome.ts` (native)

No behavioural change required for B-007 / B-017 on iPad — the native engine has its own audio path. But the hook's return type is shared via `MetronomeApi = ReturnType<typeof useMetronome>` (per CLAUDE.md). Adding `computeRhythmStartTime` / `computeMetronomeStartTime` are internal helpers, not API surface, so no native parity work is needed. Confirm by running `tsc --noEmit` after the web changes land; if a type error shows up, add the helpers as no-ops on native.

## Test plan (run on `playweb` after Terminal Claude finishes)

**B-017 — rhythm loop on metronome downbeat**

1. On any passage, open Rhythmic Variation. Pick a rhythm pattern.
2. Start the metronome (the floating metronome or via the Practice Tools layer). Let it click 4–5 measures so it's clearly running.
3. Press **▶ Loop rhythm** on the rhythm card. The first rhythm note should land on the next metronome click. Listen for the sync.
4. Stop the loop. Wait one measure. Start it again — same sync behaviour.
5. **B-017 verified** when the rhythm consistently lands on a metronome click, not somewhere in between.

**B-007 — metronome on running rhythm/exercise downbeat**

1. On any passage, open Rhythm Builder. Generate exercises and press **▶** on one to start its pitch playback.
2. While the pitch is playing, start the metronome.
3. The metronome's first tick should land on the next pitch note (not somewhere in between).
4. Repeat with the rhythm loop (Rhythmic Variation flow): start the rhythm loop, then start the metronome. Metronome's first click should land on the next rhythm downbeat.
5. **B-007 verified** when both paths sync the second-started stream to the first.

**B-008 — spacebar advances on Rhythmic Variation**

1. On any passage, open Rhythmic Variation. Pick the rhythms-only flow (not pitched-rhythm).
2. Press Space. The floating rhythm card advances to the next pattern. Same as tapping **Next →**.
3. Press Enter, Page Down, ArrowDown — each also advances.
4. Click into a text input (e.g. the note prompt if it's open). Press Space. The pattern doesn't advance (typing-target protection).
5. **B-008 verified.**

**Regression**

1. Run the existing metronome-first → exercise sync on Rhythm Builder. The sync that already worked (B-007's positive case) should still work.
2. Run a Tempo Ladder session — its keyboard shortcuts (Space = Clean, X = Miss) still work, untouched by the rhythmic-screen addition.

Log any failures as new bugs. On full pass, mark B-007, B-008, B-017 ✅ on laptop-web, push, verify iphone-web + ipad-web on live, mark squashed.

## What stays unchanged

- The metronome scheduler loop itself (the lookahead tick that schedules clicks 100 ms ahead).
- The pitch-rhythm scheduler's existing behaviour when started while the metronome is already running (the `computePitchStartTime` path).
- Token duration math (`secondsPerQuarter = (60 / bpm) * (denom / 4)`) — already correct from the 2026-05-28 work.
- Native audio path. `lib/audio/metronomeEngine.ts` and `useMetronome.ts` untouched.
- The Rhythmic Variation screen's `onNext` body — just bind a new input to it, don't change what it does.

## After it ships

Same loop: `tsc --noEmit`, `npx expo export -p web`, smoke test locally, push, verify the three web surfaces, mark B-007, B-008, B-017 squashed in the bug logger. Three bugs in one cycle.

Heads-up — B-017 is a P0 and the most user-felt of this cluster. Spend extra attention on the metronome-already-running → loop-rhythm test path. If it doesn't audibly sync, the fix didn't land.
