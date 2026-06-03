# Cluster 8: Final polish — last five bugs before launch readiness

Bugs covered: **B-001** (P1), **B-002** (P1), **B-006** (P2), **B-009** (P2), **B-011** (P2). Five small unrelated fixes. Five different files. Ship together so the BUGS.md list is empty when we move to launch readiness.

## Files to read before starting

- `components/MoveToPicker.tsx` — "📁 Library root" string (B-001).
- `app/(tabs)/library.tsx` — "Library root" string used in confirmation copy (B-001).
- `app/passage/[id]/rhythmic.tsx` — setup screen with two options stacked vertically; on phone the second one falls below the fold (B-002).
- `components/RecorderPanel.web.tsx` — the recorder save path; the existing empty-bytes guard doesn't fire on real "instant stop" because MediaRecorder still emits header bytes (B-006).
- `app/interleaved.tsx` — Rep Rotator phone overlay with off-centered ✗/✓ buttons (B-009).
- `components/PracticeToolsLayer.tsx` — Metronome `panelHeight` is 384 when a `metronomeNote` is supplied, which is too tall on Tempo Ladder + can drag above the header (B-011).
- `components/ToolDock.tsx` — owns the drag clamp that lets the metronome card poke above the screen edge.

## What changes for users

**B-001 — "Library root" reads as "Library."** Today the move-to-folder picker and the library's confirmation strings say "Library root," which reads as programmer language ("root" is filesystem talk). The user's mental model is just "the library." Fix: rename every user-visible occurrence to "Library."

**B-002 — Rhythmic Variation setup fits on iPhone without scrolling, or hints at the scroll if it can't.** Today the two setup options (rhythms-only vs build exercise) stack vertically as full-width cards. On a 6.1" iPhone in portrait, the second card is below the fold, and users don't know to scroll. Fix: shrink the cards on phone-width viewports so both fit above the fold, with a small "scroll for more" affordance if they still don't.

**B-006 — Hitting record and stopping immediately surfaces a "Recording too short" message.** Today `saveRecording` rejects zero-byte uploads, but MediaRecorder always emits at least a few hundred bytes of WEBM headers — so a 50 ms recording sneaks through and saves as a silent stub. Fix: add a minimum-duration guard (300 ms) in the Recorder panel before calling `saveRecording`; show the user a friendly "Recording too short — try again" inline.

**B-009 — Rep Rotator's ✗ Miss / ✓ Clean buttons sit symmetrically on phone.** Today the green ✓ is shifted leftward (`cleanRightExtra`) to clear the global help "?" button at the bottom-right, while the red ✗ stays flush at the bottom-left. The pair looks lopsided. Fix: apply the same inward offset to the ✗ button so both sit equidistant from their respective edges. Easy + visually symmetric without losing the help button's spot.

**B-011 — Metronome card on Tempo Ladder is right-sized and can't drag above the header.** Today `PracticeToolsLayer` sets `panelHeight = 384` when a `metronomeNote` is provided. That's taller than necessary because the note plus the metronome controls combined doesn't need that much space. Plus `ToolDock`'s vertical drag clamp permits 25% of the card to poke off the top edge, which on Tempo Ladder slides it under the header. Fix: drop the metronome's "with note" height to 320 (still has room for the note), and tighten the upward drag clamp so the card can't go above the top toolbar.

## Code-level changes

### B-001 — `components/MoveToPicker.tsx`

Find line 27:

```ts
const out: Option[] = [{ id: null, label: '📁 Library root', depth: 0 }];
```

Change to:

```ts
const out: Option[] = [{ id: null, label: '📁 Library', depth: 0 }];
```

### B-001 — `app/(tabs)/library.tsx`

Find line 659:

```ts
if (targetFolderId === null) return 'Library root';
```

Change to:

```ts
if (targetFolderId === null) return 'Library';
```

Don't change the comments that say "library root" — they're code documentation, not user-facing.

### B-002 — `app/passage/[id]/rhythmic.tsx`

Find the setup phase where the two option cards render (probably a `setup` phase render block early in the file). The pattern is typically two large Pressables stacked. On phone (`min(width, height) < 600`), apply a tighter style:

```tsx
const isPhone = Math.min(viewportWidth, viewportHeight) < 600;

// ...

<Pressable
  onPress={...}
  style={[styles.optionCard, isPhone && styles.optionCardPhone]}>
  {/* card contents */}
</Pressable>
```

Add to the stylesheet:

```ts
optionCardPhone: {
  // Phone needs to fit BOTH options above the iPhone fold. Trim padding +
  // illustration size so the two cards stack into roughly 80vh.
  paddingVertical: 14,
  paddingHorizontal: Spacing.md,
  minHeight: 88, // was probably 140+
  gap: 8,
},
```

If the existing cards have a large illustration / icon, also reduce that on phone (smaller emoji / image). If two cards still don't fit, wrap the setup phase in a `ScrollView` (it may already be one — check) and add a small "Scroll for more options ↓" hint below the first card, visible only when there are more options below the fold.

The fix is layout-y. Terminal Claude should:
1. Read the file fully to find the option-card style block.
2. Measure (mentally) how much vertical space the cards take on a 6.1" phone.
3. Either shrink the cards or add an explicit scroll affordance.

### B-006 — `components/RecorderPanel.web.tsx`

Find the save handler. The `saveRecording` call is around line 289. Before calling `saveRecording`, add a minimum-duration check on the `take.durationSec` value:

```ts
async function saveTake(take: Take) {
  if (take.durationSec < 0.3) {
    setError('Recording too short — try again.');
    return;
  }
  setSaving(true);
  setError(null);
  try {
    await saveRecording(target, take.blob, take.durationSec);
    // ...existing success path...
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Could not save recording.');
  } finally {
    setSaving(false);
  }
}
```

The 0.3 second threshold catches "tap record, tap stop immediately" while still allowing a deliberately short take (a single note recorded for half a second is fine). If the existing function isn't called `saveTake` or has a different signature, adapt — the point is: gate on `durationSec` before the upload.

Confirm the existing `setError` state already renders inline somewhere (around line 78–90, given the `setError` import). It should — Terminal Claude saw it being used at lines 174, 180, 219, 294.

### B-009 — `app/interleaved.tsx`

Find the phone overlay block (it mirrors Tempo Ladder's pattern). Look for the ✗ button's `style` — it should have `left: insets.left + 16` or similar. And the ✓ button's `style` should have `right: insets.right + 16 + cleanRightExtra`.

Apply the same horizontal inset to both. If `cleanRightExtra` is a value like 40 (computed to clear the help button), introduce `missLeftExtra = cleanRightExtra` and add it to the ✗ button's `left`:

```tsx
<Pressable
  onPress={onMiss}
  style={[
    styles.phoneRepBtn,
    styles.phoneMissBtn,
    {
      bottom: insets.bottom + repBottomLift,
      left: insets.left + 16 + cleanRightExtra, // ← same offset as the right button
    },
  ]}>
  <ThemedText style={styles.phoneRepGlyph}>✗</ThemedText>
</Pressable>
```

If `cleanRightExtra` is conditionally non-zero (only when the help button is visible), apply the same condition to the miss-left offset so both stay in sync.

Apply the same fix in `app/passage/[id]/tempo-ladder.tsx` if it has the same lopsided pattern — read its phone overlay block around line 665 to confirm. If Tempo Ladder is already symmetric, leave it alone.

### B-011 — `components/PracticeToolsLayer.tsx` + `components/ToolDock.tsx`

**Reduce the metronome panel height when a note is provided.** In `PracticeToolsLayer.tsx`, find the metronome `case 'metronome':` branch (around line 217). The relevant line:

```tsx
panelHeight={isPhone ? dockedH : metronomeNote ? 384 : 312}
```

Change to:

```tsx
panelHeight={isPhone ? dockedH : metronomeNote ? 320 : 280}
```

312 → 280 trims the no-note case too — the panel was already a bit tall for its content. 384 → 320 is the with-note case.

**Constrain the upward drag in `ToolDock.tsx`.** Find the vertical drag clamp. Today the clamp allows 25% of the card to poke off the top edge. Change to allow 0% on the top — never above the parent container's top edge. The bottom edge stays unconstrained (25% poke is fine on the bottom because the user can still grab the title bar).

The clamp lives near the gesture handler. Look for something like:

```ts
const minY = -panelHeight * 0.25;
const maxY = containerH - panelHeight * 0.75;
```

Change `minY` to `0` (or a small safe offset like `8` so it sits below the screen top with a small inset):

```ts
const minY = 0; // was -panelHeight * 0.25 — keep the card below the top edge
const maxY = containerH - panelHeight * 0.75;
```

If the variable names differ, read the file and find the equivalent. The point: prevent upward drag past the top of the parent.

## Test plan (run on `playweb` after Terminal Claude finishes)

**B-001 — "Library" rename**

1. From the library, long-press or open the move-to-folder menu on a passage. The destination list shows "📁 Library" at the top, not "📁 Library root."
2. Confirm a move to the top level — the toast or confirmation copy says "Moved to Library" (or whatever the existing pattern is), not "Moved to Library root."
3. **B-001 verified.**

**B-002 — Rhythmic Variation iPhone**

1. Open Safari on an iPhone (or Chrome DevTools' iPhone 12 simulator). Go to playfastnotes.com. Sign in. Open a passage. Tap Rhythmic Variation.
2. Both option cards fit above the fold of the iPhone viewport — you can see "Rhythm patterns" and "Build exercise" without scrolling.
3. If they don't both fit, the "Scroll for more ↓" affordance is visible.
4. **B-002 verified.**

**B-006 — Recording too short**

1. Open any passage. Pop out the Recorder tool.
2. Hit record. Hit stop within ~100 ms (about as fast as you can tap twice).
3. The recorder shows "Recording too short — try again." No silent save lands in the practice log.
4. Hit record again. Wait a full second. Stop. Save normally.
5. **B-006 verified.**

**B-009 — Rep Rotator buttons symmetric**

1. Open the library on a phone-width viewport (or browser narrowed to ~390px wide). Hit 🔀 Rep Rotator. Pick two passages and start a session.
2. The ✗ Miss button (red, bottom-left) and the ✓ Clean button (green, bottom-right) are equidistant from the screen edges. Visual symmetry.
3. The bottom-right help "?" sits above the green button, not next to it.
4. **B-009 verified.**

**B-011 — Metronome card right-sized**

1. Open Tempo Ladder. The metronome card pops out automatically (because the strategy passes a `metronomeNote`). Its height fits the content cleanly — no big empty space at the bottom.
2. Drag the metronome card upward. It stops at the top toolbar — never slides under it.
3. Drag downward — the card can still poke off the bottom (you can still grab its title bar).
4. **B-011 verified.**

**Regression**

1. Other practice screens (Click-Up, Rep Rotator, Rhythm Builder) — the metronome card's smaller height doesn't clip controls.
2. Other practice screens with phone overlays — the symmetry change doesn't introduce a regression on Tempo Ladder if you also applied it there.
3. The recorder still saves recordings ≥ 300 ms cleanly.
4. Moving a passage to a real (named) folder still says the folder's name in the toast, not "Library."

Log any failures as new bugs. On full pass, mark all five squashed on laptop-web, push, verify on the three web surfaces, mark squashed in the bug logger.

## What stays unchanged

- The folder hierarchy / move semantics — only the user-visible label changes.
- The recorder's MediaRecorder pipeline and the existing `bytes.length === 0` guard (it stays as the belt-and-suspenders backstop for legitimate zero-byte cases).
- The metronome's audio behaviour, RHYTHMS, beat patterns.
- The Rep Rotator session logic, the per-spot tempo memory, the random-order pick.
- The ToolDock's resize / pinch / collapse behaviour — only the upward drag bound changes.

## After it ships

`tsc --noEmit`, `npx expo export -p web`, smoke locally, push, verify on three web surfaces, mark B-001 / B-002 / B-006 / B-009 / B-011 squashed in the bug logger.

At that point the active list is empty. Every bug in the log is killed (a satisfying screen). Time to move to launch readiness: friend-test the live site with the people you'd actually want as paying users (musicians + your studio + Stacie if she'll humor you), iPad cutover, then the iPhone-native UX pass and the universal-binary scope from Phase B of the launch plan.
