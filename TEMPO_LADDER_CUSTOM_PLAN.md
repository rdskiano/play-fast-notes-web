# Tempo Ladder — Custom mode plan

_Drafted 2026-05-24 from a planning conversation with the user._

## Goal

Add a third mode to Tempo Ladder ("Custom") that lets a user build a named rep pattern (a list of `count × tempo` blocks) and run it as a click-up session. Saved Custom patterns appear in the mode picker alongside Step click-up and Randomized cluster, so the user's own "My 9+1" sits next to the built-ins forever after.

## Why

Step click-up climbs one step after N clean reps. Randomized cluster picks a random tempo per rep within a band. Real practice rooms run dozens of other patterns ("9 at slow + 1 at slow+10," "9 at slow + 1 at performance," "5/3/2 climb"), and the most useful are the ones that are hard to drive yourself — like landing a single faster rep at an unpredictable point. Custom mode hands the metronome the pattern definition and lets the user just play.

## Scope (v1)

In:

- Reorganize the Tempo Ladder setup screen: mode picker at the top, mode-specific config below.
- Add Custom mode.
- Build the Pattern Editor (Name + block list + tempo dropdown + live preview).
- Persist Custom patterns per-user in Supabase, so they follow the user across passages and devices.
- New variable-size dot strip on the practice screen that encodes per-rep tempo and supports strict miss-restart.

Out (deferred to later passes):

- Rename / Delete / Duplicate of saved patterns (basic Edit only in v1).
- Shuffle order within set.
- Pre-baked starter patterns shipped with the app (could ship one or two if cheap, but not a curated set).
- Custom mode inside Interleaved Click-Up (different feature; data model would compose naturally but UI is its own thing).

## User-facing flow

1. User opens a passage → taps Tempo Ladder.
2. Setup screen shows: mode picker grid at the top — Step click-up, Randomized cluster, any saved Custom patterns, and a **+ Build a custom pattern** card.
3. Tapping **+ Build** opens the Pattern Editor sheet. User names the pattern, adds blocks, taps Save → the pattern is stored under the user, appears in the picker, and is auto-selected for this passage.
4. Below the picker the user sets **Base** / **Performance** / **Increment** (shared across all modes), plus the mode-specific extras:
   - **Step click-up**: Reps to advance.
   - **Randomized cluster**: Reps to advance + cluster low/high band.
   - **Custom**: just shows the pattern preview + an **Edit pattern** button. No "Reps to advance" field — the pattern itself is the success criterion.
5. User taps Start.
6. Practice screen plays the pattern. Variable-size dot strip shows where you are in the pattern. Clean ✓ ticks the next dot. Miss ✗ resets all dots and the current block index to zero (**Strict** — confirmed by user). Complete the pattern with all clean → Base bumps by Increment, dots reset, repeat at the higher tempo. When Base ≥ Performance → session complete.

## Setup screen sketch

```
Tempo Ladder — Setup
─────────────────────────────────────
Mode

  ┌──────────────┐  ┌──────────────┐
  │ ● Step       │  │ ○ Randomized │
  │   click-up   │  │   cluster    │
  │ ──────────── │  │ ──────────── │
  │ Climb one    │  │ Random tempo │
  │ step after N │  │ in a low-    │
  │ clean reps   │  │ high band    │
  └──────────────┘  └──────────────┘
  ┌──────────────┐  ┌──────────────┐
  │ ○ My 9+1     │  │ + Build a    │
  │ ──────────── │  │   custom     │
  │ 9 × Base     │  │   pattern…   │
  │ 1 × Base+10  │  │              │
  └──────────────┘  └──────────────┘

Base tempo:      [  90 ]
Performance:     [ 120 ]
Increment:       [ - ][ 2 ][ + ]  BPM

(Step click-up only)
   Reps to advance:  [ - ][ 3 ][ + ]

(Randomized cluster only)
   Band:  [ 90 ] – [ 110 ]
   Reps to advance:  [ - ][ 3 ][ + ]

(Custom only)
   Pattern preview:
      ●  ●  ●  ●  ●  ●  ●  ●  ●  ⬤
      9 × Base · 1 × Base + 10
   [ Edit pattern ]

         [    Start practicing    ]
```

## Pattern Editor sketch

```
Build Custom Pattern
──────────────────────────────────────
Name:  [ My 9+1                       ]

Blocks
──────────────────────────────────────
                   Count       Tempo
  Block 1     [ − ][ 9 ][ + ]  [ Base       ▾ ]   ✕
  Block 2     [ − ][ 1 ][ + ]  [ Base + 10  ▾ ]   ✕
                                + Add block

Tempo dropdown options:
   Base
   Base + 5
   Base + 10
   Base + 15
   Performance
   Custom BPM…   ← opens a number input

Preview
   ●  ●  ●  ●  ●  ●  ●  ●  ●  ⬤
   9 × Base · 1 × Base + 10

[ Cancel ]                       [ Save ]
```

Save is disabled until Name has at least one non-whitespace character. No other validation — block tempos that exceed Performance are fine (they represent intentional overshoot).

## Variable-size dot strip

The progress indicator becomes a tiny visual score of the pattern's difficulty curve. Each rep is one dot; the dot's size encodes that rep's tempo.

For "9 × Base, 1 × Base + 10":

```
   ●  ●  ●  ●  ●  ●  ●  ●  ●  ⬤
   └────── 9 × Base ──────┘  ↑Base+10
```

For "5 × Base, 3 × Base+5, 2 × Base+10":

```
   ●  ●  ●  ●  ●    ◉  ◉  ◉    ⬤  ⬤
```

Sizing rule: `radius = baseRadius × (1 + k × offsetFromBase)`, capped so the biggest dot is at most ~1.5× the smallest. `k` tuned during implementation. Currently-playing dot gets an accent color or an outline ring so the user always knows where they are. Hit Miss → all dots reset to empty, position returns to block 1 / rep 1.

A nice freebie: the user **sees the difficulty curve before they play it.** "Oh right, the punch lands at the end" is communicated pre-attentively.

## Data model

### New Supabase table: `custom_patterns`

```sql
create table custom_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  blocks jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table custom_patterns enable row level security;

create policy "users can read their own patterns"
  on custom_patterns for select using (auth.uid() = user_id);
create policy "users can insert their own patterns"
  on custom_patterns for insert with check (auth.uid() = user_id);
create policy "users can update their own patterns"
  on custom_patterns for update using (auth.uid() = user_id);
create policy "users can delete their own patterns"
  on custom_patterns for delete using (auth.uid() = user_id);
```

### `blocks` JSON shape

```ts
type Block = {
  count: number;     // 1..20
  tempo:
    | { kind: 'base' }
    | { kind: 'base_plus'; delta: number }   // base + N (delta > 0)
    | { kind: 'performance' }
    | { kind: 'absolute'; bpm: number };
};
```

Constraint: 1..8 blocks per pattern. Enforced client-side; the column accepts any JSON.

### Extension to `pieces.tempo_ladder_config_json`

Today it holds the existing step/cluster config (see `lib/db/repos/tempoLadder.ts`). Add two new optional fields:

```ts
mode: 'step' | 'cluster' | 'custom';        // existing values + 'custom'
custom_pattern_id?: string;                  // uuid; meaningful when mode === 'custom'
```

Configs without `mode` continue to default to `'step'`. The `lib/db/repos/tempoLadder.ts` accessors get adjusted but the schema is additive — no migration needed for the existing `pieces` rows.

## File map

### New files

- **`lib/strategies/customPatterns.ts`** — `CustomPattern`, `Block`, `TempoRef` type defs. Pure helpers: `resolveBlockBpm(block, base, performance) => number`, `expandPatternToReps(pattern, base, performance) => RepStep[]`, `summarizePattern(pattern) => string` (for the picker card subtitle), `validatePattern(pattern) => string | null`.
- **`lib/supabase/customPatterns.ts`** — `listCustomPatterns(userId)`, `getCustomPattern(id)`, `createCustomPattern(userId, name, blocks)`, `updateCustomPattern(id, partial)`, `deleteCustomPattern(id)`. Single file used by both native and web (same pattern as `lib/supabase/recordings.ts`).
- **`components/CustomPatternEditor.tsx`** — the modal sheet: Name input, block list, per-block count stepper + tempo dropdown, add/delete buttons, live `CustomPatternDots` preview, Cancel / Save. Validates name non-empty.
- **`components/CustomPatternDots.tsx`** — the variable-size dot strip. Props: `pattern`, `base`, `performance`, `position` (current rep index or null), `state` ('idle' | 'playing' | 'failed' | 'complete'). Used twice: in the editor preview and on the practice screen.
- **`components/TempoLadderModePicker.tsx`** — the card grid extracted out of `TempoConfigFields.tsx` for cleanliness. Renders built-in mode cards, saved Custom pattern cards, and the `+ Build` card.
- **`db/migrations/20260524_custom_patterns.sql`** — the SQL migration above (or whatever the project's migration convention is; check `db/` layout).

### Edited files

- **`app/passage/[id]/tempo-ladder.tsx`** (621 lines today) — restructure the setup form: mode picker first, then shared config (Base/Performance/Increment), then a mode-specific section that switches on `mode`. Move the existing inline mode toggle (currently around line 174) up to the top.
- **`components/TempoConfigFields.tsx`** (96 lines today) — split: keep the BPM step inputs; pull the mode toggle into `TempoLadderModePicker`; add a `CustomModeFields` subcomponent that shows the pattern preview + Edit button. Drop the mode-conditional `Start BPM / Goal BPM` label flipping (it's redundant once Custom enters the picture — Base and Performance are always called those).
- **`hooks/useTempoLadderSession.ts`** (330 lines today) — add a Custom mode branch. New state: `currentBlockIndex`, `currentRepInBlock`, plus a derived `currentBpm` from `resolveBlockBpm(block, base, performance)`. On Clean: advance `currentRepInBlock`; roll over to next block when block.count reached; roll over to next set when all blocks done. On set completion with no misses: bump Base by Increment, reset position. On Miss in Custom mode: reset position to `(0, 0)` immediately, leave Base unchanged. Session-end check: `base >= performance` evaluated after each Base bump.
- **`lib/db/repos/tempoLadder.ts`** + **`.web.ts`** — extend the load/save shape to include the new `mode` + `custom_pattern_id` fields. Default `mode` to `'step'` on read when absent.
- **The practice screen** (wherever the streak dots currently render — probably also inside `app/passage/[id]/tempo-ladder.tsx`) — swap the existing streak-dots renderer for `CustomPatternDots` when `mode === 'custom'`. Keep the existing renderer for Step / Cluster.

## Open questions for implementation

These are small enough to decide while coding:

- **Dot strip on phone width.** The existing phone "dots pill" is top-center and tight. Variable-size dots need a bit more horizontal room. At ~12 px min dot diameter + 4 px gap, 16 dots fit in ~256 px — comfortable on the 360 px iPhone width. Pattern length cap of 8 blocks × max 20 reps = 160 reps theoretical max, but realistic patterns will be 5–15 reps total. If a power user builds something huge, fall back to a compact two-row layout.
- **Deleted-pattern cleanup.** If the user deletes a Custom pattern that a passage's config is pointing at, the next time that passage is opened the setup screen should silently reset `mode` to `'step'` and clear `custom_pattern_id`. Show a one-time toast: "Your previously-selected Custom pattern was deleted — switched to Step click-up." No data loss because the rest of the config (Base / Performance / Increment) is still valid.
- **Performance reached during a set.** If Base = Performance and the user's pattern has a "Base + 5" block, that rep plays at Performance + 5. That's intentional. The session-end check fires *after* the pattern completes cleanly, not mid-set — so you always get to finish the set you're on.
- **Practice-log entry shape.** Today Tempo Ladder logs `strategy: 'tempo_ladder'` plus `data_json` with `mode`, `start_tempo`, etc. Extend `data_json` to include `pattern_id` and `pattern_name` when `mode === 'custom'` so the log renders "Tempo Ladder · My 9+1" instead of plain "Tempo Ladder". Backward-compatible.

## Risks & sanity checks

- **Strict miss + impatient users.** Strict means restart at rep 1 on any miss. For "9 + 1" that's reasonable. For "20 + 1" it could feel punishing. The per-block count cap of 20 is the safety valve for v1; revisit if friction shows up in friend-testing.
- **No validation on tempo references.** A user's pattern can push the metronome past Performance. That's intentional per the user (overshoot training). The only validation is name-non-empty.
- **iPad cutover pending.** The native iPad app today still runs the old `learn-fast-notes` codebase. Custom mode will only work on the unified repo's iOS build, so iPad users will get it after the cutover (or via iPad Safari at playfastnotes.com now). No back-port to `learn-fast-notes` needed.
- **Existing config compatibility.** The new `mode` field is additive. Old `pieces.tempo_ladder_config_json` rows without it read as `mode: 'step'`, preserving today's behavior for every existing passage.

## Implementation order

A single focused session for v1 would touch things in roughly this order:

1. **Schema + repo** — `custom_patterns` table + `lib/supabase/customPatterns.ts`. Easy to verify in isolation; lets the rest be built against real persistence.
2. **Types + helpers** — `lib/strategies/customPatterns.ts`. Pure TS, fast to iterate.
3. **`CustomPatternDots` component** — the visual primitive used by both editor preview and practice screen. Build with hard-coded patterns first; verify sizing math.
4. **`CustomPatternEditor`** — the modal sheet. Reuses the dots component as a live preview.
5. **`TempoLadderModePicker`** + setup screen restructure — mode picker at top, shared config below, mode-specific block below that. Custom card opens the editor; saved patterns are auto-selected on tap.
6. **`useTempoLadderSession` Custom branch** — runtime state machine. Smoke-test by running through a hand-built pattern.
7. **Practice screen wiring** — swap dots renderer for `CustomPatternDots` when mode is custom; verify strict miss resets cleanly; verify Base climbs on clean cycles; verify victory fires when Base reaches Performance.
8. **Telemetry + practice-log labels** — extend `data_json` with `pattern_id` + `pattern_name`; extend `STRATEGY_LABELS` consumers (folder-log / library-log / etc.) to render the pattern name when present.

Estimated effort: one focused session if the setup screen restructure goes smoothly; two if `useTempoLadderSession` needs more rewiring than expected.

## Future extensions (not v1)

- Rename / Delete / Duplicate from a long-press menu on the picker card.
- Shuffle order within set (each block's reps are still played `count` times, but the *order* of blocks within the set is shuffled). Toggle on the pattern.
- A small library of pre-baked starter patterns ("9 + 1 over," "9 + 1 at performance," "Surprise rep," "5/3/2 climb") that show up alongside the user's own. Probably ships with their own icons and prefixed names to distinguish from user patterns.
- "Used in N passages" line on the pattern card so the user understands the impact of deleting one.
- Per-passage pattern overrides — if v1 turns out to need it, the `pieces.tempo_ladder_config_json.custom_pattern_id` slot already supports it; UX would just need to expose "use a different pattern for this passage."
