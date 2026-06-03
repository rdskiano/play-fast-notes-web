# Cluster 5: Rhythm Builder polish — PDF wrap + re-spell discoverability

Bugs covered: **B-015**, **B-016** from `BUGS.md`. Both P0s. Both in the Rhythm Builder area.

## Files to read before starting

- `lib/export/buildExerciseHtml.ts` — the marketing-quality PDF template. Owns the abcjs render call whose options control whether long lines wrap. The whole file is ~200 lines; read all of it.
- `app/passage/[id]/rhythm-builder.tsx` — the Rhythm Builder screen. The pitch-entry view (around line 670) renders `PitchStaff` with an `onNoteTap` callback; the hint goes here. Skim the full file structure first; the entry view is one of several phases (`setup` / `entry` / `generate`).
- `components/PitchStaff.tsx` — read enough to confirm `onNoteTap` is the correct callback name and that tapping a note opens the inline editor (`NoteCardEditor` via the `editingIndex` state). Don't change this component.

## What changes for users

**B-015 — Long exercises wrap to multiple staff lines in the printed PDF instead of squishing into one.** Today `buildExerciseHtml.ts` calls abcjs with `staffwidth: 680` and `responsive: 'resize'` but no `wrap` option. When a passage is long, abcjs lays out a single staff line at its natural width and the SVG scales down to fit the page — visually squishing the notation. Fix: enable abcjs's wrap mode so long passages break onto multiple staff lines, with the SAME spacing density on every page regardless of passage length.

**B-016 — A visible hint tells you that you can tap a note to re-spell or edit it.** Today the only place this is documented is inside the Tutorial step which is gated `visible={false}` — the user who skipped the first-run tutorial never sees the affordance. Tapping a note opens `NoteCardEditor`, which can re-spell (B♭ → A♯) or insert a note before/after. Fix: a small caption beneath the piano keyboard / above (or below) the PitchStaff: "**Tap any note to re-spell or edit.**"

## Code-level changes

### `lib/export/buildExerciseHtml.ts`

**Switch the abcjs render call to wrap long exercises.** Find the `renderCalls` block:

```ts
const renderCalls = exercises
  .map(
    (ex) => `
  try {
    ABCJS.renderAbc('${ex.id}', ${ex.escapedAbc}, {
      scale: 0.9,
      staffwidth: 680,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 2,
      paddingbottom: 2,
      responsive: 'resize',
    });
  } catch(e) {
    document.getElementById('${ex.id}').innerHTML = '<p style="color:red">Error: ' + e.message + '</p>';
  }`,
  )
  .join('\n');
```

Replace it with:

```ts
const renderCalls = exercises
  .map(
    (ex) => `
  try {
    ABCJS.renderAbc('${ex.id}', ${ex.escapedAbc}, {
      scale: 0.9,
      staffwidth: 680,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 2,
      paddingbottom: 2,
      // Let abcjs lay out long passages on multiple staff lines instead
      // of squishing one line to fit the page. preferredMeasuresPerLine
      // = 4 produces a comfortable density that matches the on-screen
      // view; minSpacing/maxSpacing constrain note-spacing so a wrapped
      // line doesn't look loose.
      wrap: {
        minSpacing: 1.4,
        maxSpacing: 2.7,
        preferredMeasuresPerLine: 4,
      },
      // 'resize' scales the SVG to fit a smaller container if needed;
      // without it, abcjs uses fixed staffwidth pixels which may
      // overflow the page margins for some print engines.
      responsive: 'resize',
    });
  } catch(e) {
    document.getElementById('${ex.id}').innerHTML = '<p style="color:red">Error: ' + e.message + '</p>';
  }`,
  )
  .join('\n');
```

Only the `wrap: { ... }` block is new. Comments above explain the intent for future readers.

**Confirm the print page width matches the staff width.** Read the `@page` declaration:

```css
@page { margin: 0.5in 0.55in 0.6in; size: letter; }
```

Letter is 8.5" wide, side margins 0.55" each → 7.4" printable = 710 px at 96 dpi. The current `staffwidth: 680` leaves a thin gutter, which is fine. No change required, but if Terminal Claude finds the user reports of "doesn't quite match the screen" persist, try bumping `staffwidth` to 700.

### `app/passage/[id]/rhythm-builder.tsx`

**Add the re-spell hint.** Around line 670–681 the pitch-entry view renders the piano keyboard above the PitchStaff. Insert a small caption between them. The exact spot:

```tsx
<View style={styles.keyboardWrap}>
  <PianoKeyboard onKeyPress={onKeyPress} preferSharps={useSharps} />
</View>

<PitchStaff
  pitches={pitches}
  keySignature={keySignature}
  clef={clef}
  width={winWidth}
  onNoteTap={(i) => setEditingIndex(i)}
  activeNoteIndex={editingIndex}
/>
```

Change to:

```tsx
<View style={styles.keyboardWrap}>
  <PianoKeyboard onKeyPress={onKeyPress} preferSharps={useSharps} />
</View>

{pitches.length > 0 && (
  <ThemedText style={[styles.respellHint, { color: C.icon }]}>
    Tap any note to re-spell or edit.
  </ThemedText>
)}

<PitchStaff
  pitches={pitches}
  keySignature={keySignature}
  clef={clef}
  width={winWidth}
  onNoteTap={(i) => setEditingIndex(i)}
  activeNoteIndex={editingIndex}
/>
```

The `pitches.length > 0` gate hides the hint before the user has entered any notes — no point teaching an interaction with nothing to interact with.

**Add the style to the stylesheet at the bottom of the file:**

```ts
respellHint: {
  textAlign: 'center',
  fontSize: 12,
  fontStyle: 'italic',
  marginTop: 4,
  marginBottom: 6,
  letterSpacing: 0.02,
},
```

If `ThemedText` and `C` (the colour-scheme object) aren't already imported at the top of the file, confirm and add them. They're used elsewhere on this screen so they should already be in scope.

### `components/PitchStaff.tsx`

**No change.** The component already supports `onNoteTap`. We're just teaching the user it exists.

## Test plan (run on `playweb` after Terminal Claude finishes)

**B-015 — PDF wrap**

1. On a fresh passage, open Rhythm Builder. Set up a key + clef + grouping.
2. Enter ~16 pitches (enough to make the resulting exercise long).
3. Generate exercises. Hit "Print PDF" → open the PDF preview.
4. Look at any exercise with a long notation line. It should wrap onto multiple staff lines, with comfortable note spacing — not squished into one cramped line.
5. The on-screen Generate view should also look similar density-wise (sanity check that the on-screen Abc render and the PDF Abc render agree).
6. **B-015 verified.**

**B-016 — re-spell hint**

1. Open Rhythm Builder. Tap a few piano keys to enter pitches.
2. Below the piano keyboard and above the staff, the italic line "Tap any note to re-spell or edit." should appear.
3. Tap a notehead on the staff. The `NoteCardEditor` opens (the existing behaviour). Re-spell B♭ → A♯ and confirm the staff updates.
4. Clear all pitches. The hint disappears (it's gated to `pitches.length > 0`).
5. **B-016 verified.**

**Regression**

1. The on-screen Abc render in the Generate phase still looks right.
2. The PDF brand block, footer, and exercise numbering still render unchanged.
3. The Rhythm Builder pitch-entry view layout (piano keyboard → hint → staff → back button) still scrolls correctly on phone and laptop.

Log any failures as new bugs. On full pass, mark B-015 and B-016 ✅ on laptop-web, push, verify iphone-web + ipad-web on live, mark squashed in the bug logger.

## What stays unchanged

- The abcjs CDN URL, the staffwidth value, the scale factor.
- The PDF brand header, exercise numbering, and footer.
- The Rhythm Builder phase structure (setup / entry / generate).
- The `PitchStaff` component itself, the `NoteCardEditor`, the inline editing flow.
- The TutorialStep content — leave the tutorial body that already mentions re-spelling alone; the new hint is a supplement to it, not a replacement.

## After it ships

Same loop: `tsc --noEmit`, `npx expo export -p web`, smoke test locally, push, verify the three web surfaces, mark B-015 + B-016 squashed in the bug logger. Two P0s in one round.

After Cluster 5, the remaining P0s are B-018 (interleaved log entry), B-022 (arrow keys), B-023 (PDF title), B-024 (library search). Plus B-001 (P1 rename), B-002 (P1 phone, deferred), and four P2s (B-004, B-006, B-009, B-011). Eleven bugs to go.
