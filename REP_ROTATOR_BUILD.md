# Rep Rotator: rename and reframe Serial Practice as a named, simplified tool

The Serial Practice CTA on the library landing page is being replaced by a named tool called **Rep Rotator**. This is a rename plus simplification, not a feature add. The whole conversation that produced this spec is documented; what follows is the build brief.

Read the following files before starting:

- `app/(tabs)/library.tsx`
- `app/interleaved.tsx`
- `components/PassagePicker.tsx`
- `app/passage/[id]/index.tsx`
- `components/PassageReminders.tsx`
- `components/StrategyColorsContext.tsx`

## What changes for users

The library's loud "Try serial practicing?" CTA goes away. A small 🔀 button appears in the library top button cluster, next to Practice Log. On tablet and desktop it's labeled "Rep Rotator". On phone it's icon-only at narrow viewports, matching the rest of that cluster.

A new Rep Rotator pill is added to the passage-detail strategy pill row, alongside Tempo Ladder, Click-Up, and Rhythmic. The phone ⋯ ActionSheet picks it up automatically because it iterates the same STRATEGIES array.

Tapping the library 🔀 goes straight to the PassagePicker with nothing pre-selected. Tapping the passage-detail pill goes to the PassagePicker with the current passage pre-selected.

The Order chips (Serial / Interleaved) in the config screen are hidden from the UI. Sessions always run with random order. A note saying "Passages will appear in random order." appears where the Order chips used to be.

A "?" help button is added to the lower right of the PassagePicker (select phase) and the config screen. It opens a Rep Rotator explainer modal.

A TutorialStep with id `rep-rotator-first-run` fires the first time the user enters the PassagePicker from either entry point. Uses the same copy as the "?" modal.

The library's existing "?" (PracticeProgressionModal) is edited so step 2 references Rep Rotator by name.

## Code-level changes

### `app/(tabs)/library.tsx`

Remove (only if not used elsewhere; the TutorialStep with id `library-add` gates on `practiceCount === 0`, so keep `practiceCount` if that's its only remaining consumer):

- `SERIAL_REVEAL_THRESHOLD` constant
- `SERIAL_TRIED_KEY` constant
- `serialEligible`, `serialTried`, `serialExplainerOpen` state
- The `getSetting(SERIAL_TRIED_KEY)` call in `refresh()`
- The Serial Practice CTA block (`{serialEligible && (<View style={styles.modeRow}>...)}`)
- The inline progression footer (`<ThemedText style={[styles.modeFooter, ...]}>`)
- The `SerialPracticeExplainerModal` component and its render call
- The `setSetting(SERIAL_TRIED_KEY, '1')` call inside the modal's `onTryNow`

Add a 🔀 button to the top cluster, sitting between the Practice Log button and the Settings button. Mirror the existing pattern. On phone it's an `iconBtn`-style 🔀, matching the ☕ / 📋 / ⚙ / ✎ icons. On tablet and desktop it's a labeled `Button` reading "Rep Rotator". The `onPress` navigates to `/interleaved`.

Edit the `PracticeProgressionModal`'s steps array: replace step 2's title and body with the new copy below. Step 1 is unchanged.

### `app/interleaved.tsx`

In the config phase, hide the Order chips section (the `<ThemedText style={styles.sectionLabel}>Order</ThemedText>` block and its two `<Chip>` children). Keep the underlying `order` state and the `SessionOrder` type intact. Default the initial state to `'random'` permanently, not `'serial'`.

Above the rep count picker (where the Order section used to be), add a small caption styled like other helper text: "Passages will appear in random order."

Change the screen title in the config phase from "Serial Practice" to "Rep Rotator" (the `<ThemedText style={styles.topCenter}>Serial Practice</ThemedText>` inside the SessionTopBar).

Add a "?" help button anchored to the lower-right of both the config phase and the select phase. It opens a new `RepRotatorExplainerModal` component. Define it locally in this file or extract it to `components/`. Contains the title and body below.

In the select phase, change the SessionTopBar `center` text from "Select passages" to "Pick passages to rotate through".

Add a `<TutorialStep id="rep-rotator-first-run" visible={true} title="Rep Rotator" body={...} />` to the select phase. The TutorialStep component already handles first-time-only display via the id, so leaving `visible={true}` is correct.

Accept a new optional route param `seedPassageId`. If present, pre-select that passage in `selectedIds` on mount. Use a `useEffect` that depends on `passages` loading, then sets `selectedIds` to include the seed once the passage list is available.

### `app/passage/[id]/index.tsx`

Add `{ key: 'rep_rotator', label: 'Rep Rotator', enabled: true }` to the `STRATEGIES` array. Pick an order in the array that makes visual sense; alongside the other three pills is fine.

Add a `'rep_rotator'` branch to `openStrategy()` that calls `guardedNav(() => router.push({ pathname: '/interleaved', params: { seedPassageId: passage.id } }))`.

Add `'rep_rotator'` to the `StrategyKey` type at the top of the file.

### `components/StrategyColorsContext.tsx`

Add a strategy color for `rep_rotator`. Pick something distinct from the existing four (Tempo Ladder green, Click-Up navy, Rhythmic purple, Self-Led tint). Suggested: a teal or a warm amber.

### `components/PassageReminders.tsx`

Add `rep_rotator: 'Rep Rotator'` to the `STRATEGY_LABELS` map so any future log entries display the friendly name. Also consider whether the existing `interleaved: 'Serial'` entry should be relabeled to `interleaved: 'Rep Rotator'` since the storage value for new sessions stays as `'interleaved'` (see Practice log storage below). The friendly name in Practice History should match the new tool name.

## Practice log storage

Practice log entries currently use `strategy: 'interleaved'` for serial-practice sessions. Keep that string. Don't migrate existing rows. New entries from Rep Rotator continue to write `'interleaved'` as the storage value. Only the user-facing label changes (handled by the STRATEGY_LABELS map).

If at some later point you want to switch the storage value to `'rep_rotator'`, add a mapping so old `'interleaved'` rows still render correctly in Practice History. For this change, leave storage alone.

## Copy to use verbatim

### Rep Rotator explainer modal (shared by the "?" and the TutorialStep)

Title:

```
Rep Rotator
```

Body:

```
Rotate through several passages in random order instead of drilling them one at a time. Pick a handful, set how many clean reps you want from each, and the app shuffles between them as you play.

Think interleaved practicing, or a mock audition round.

Drilling one passage over and over gets it polished. Rotating between several tests whether you're prepared to play it right the first time.
```

### Library `PracticeProgressionModal` step 2 (replaces existing step 2)

Title:

```
Rep Rotator
```

Body:

```
Use Rep Rotator (🔀 in the top bar) to drill several passages in a single session. Set a target number of clean reps on each, and the app cycles you through them at random. Use it for mock audition rounds, recital run-throughs, or any time you need passages to hold up cold.
```

Step 1 stays unchanged.

## What stays in the data layer (do NOT remove)

The `SessionOrder` type and the `order` state stay, hardcoded to `'random'`. The `buildLapOrder` and `nextRandomLap` logic (missed-from-previous-lap goes to the front of the next lap) stays in place. That's pedagogy worth keeping. Don't surface it in the UI; the decision was to keep the behavior but not name it as a feature yet.

Per that decision, do not add new user-visible copy that mentions the "missed ones first" behavior anywhere.

## Test plan

1. Library top cluster shows the 🔀 button on tablet and desktop with the "Rep Rotator" label, and as icon-only on phone. Tapping it opens the PassagePicker with nothing pre-selected.
2. Passage detail shows the Rep Rotator pill in the strategy row and in the phone ⋯ ActionSheet. Tapping it opens the PassagePicker with the current passage already selected.
3. The first time the user reaches the picker (from either entry point), the TutorialStep fires with the Rep Rotator explainer. Subsequent visits do not show it.
4. The "?" button in the lower right of the picker and config screens opens the same explainer at any time.
5. The config screen has no Order chips. Just rep count and the "random order" note.
6. The library's "?" (Practice progression modal) step 2 reads as the new copy and mentions Rep Rotator by name.
7. The old Serial Practice CTA, inline footer, SerialPracticeExplainerModal, and `SERIAL_TRIED_KEY` setting are all gone from the library.
8. Practice History for a session run via Rep Rotator renders correctly with the "Rep Rotator" label (because STRATEGY_LABELS is updated).
9. On web, smoke-test locally with `playweb` before pushing. After `git push web-origin-archive master`, smoke-test the live URL.
10. On iPad simulator, verify the same flows work natively.

## Stack and conventions reminders

This is the merged Expo repo. Per `CLAUDE.md`:

- `web-origin-archive` remote is the live web deploy. Smoke-test locally with `playweb` before pushing.
- Platform-split conventions: `_layout.tsx` is single-file with `Platform.OS` checks; other files use `.ts` for native and `.web.ts` for web.
- The vocabulary is `passage` in TS and `pieces` in SQL. Don't try to "fix" `piece_id` in SQL identifiers.

## After shipping

Update `ROADMAP.md` and the parent CLAUDE.md's "Where to pick up next" section to reflect that the Serial Practice → Rep Rotator rename is done, and add a memory write-up reference like `[[project_rep_rotator]]` if that pattern is in use.
