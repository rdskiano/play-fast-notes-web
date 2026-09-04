# Roles & Phases — the music-classification skeleton (v1 spec draft)

**Status: DRAFT for Ralph's markup — 2026-09-02.** Born from the Session 6
practice narration (COACH_SIGNAL_LOG.md D53–D66) and the design conversation
of 2026-09-02. Nothing here is built. Ralph has explicitly NOT ratified the
per-role coach behaviors (his pin, see Undecided).

## The idea in one paragraph

Every piece of music in the app gets two pieces of identity. **Role** — what
this music IS to the player — chosen once and rarely changed: *Exercise ·
Ensemble part · Solo/concerto · Audition list*. **Phase** — where the player
IS with it right now — a living value that moves over time and can always be
changed by hand. For exercises, phase is a toggle: **building tempo ↔
static**. For repertoire (the other three roles), phase is a **slider** from
*totally unfamiliar* to *performance-ready*. The coach, the assessment, and
the daily-exercises feature all read this identity instead of guessing from
the practice trail — which the narrated sessions proved the trail cannot
support (attendance receipts, polishing without probes, maintenance tempos).

## Why this exists (what it fixes, all observed live)

- **D53 (pinned misfire):** the coach tells daily-routine passages to cement
  their scales with ICU. With a role, the coach simply knows.
- **D56:** the ladder has no "stay at this tempo" mode → that's the exercise
  toggle set to *static*.
- **D57:** daily-routine sessions are logging rituals, not practice — the
  trail on exercise-role pieces is ceremony; rules must not read it.
- **D59:** learning vs. polishing — the probe-at-goal assessment is a
  learning-phase instrument; played-before pieces skip it. The phase slider
  IS the played-before question, with more information.
- **D66:** assessment outcome routes by distance from goal (solid / shaky /
  ladder / below-50% → chaining). Lives inside the learning-phase flow.

## V1 scope (the first bite — deliberately small)

1. **The role question.** Four choices, asked once per piece. Where it's
   asked: proposed at add-time with an edit-anytime affordance; batch
   uploads default sensibly (open — see Undecided).
2. **Exercise role → the daily treatment** (this absorbs the August
   "Daily exercises" design as its door):
   - A "Daily" shelf/row: cards showing name + current tempo (♩=N).
   - One-tap **"done today at ♩=N"** — the 10-second check-in that replaces
     the one-rep-ladder ritual. Works with zero playing through the app
     (the app is the notebook; notebooks don't care where you practiced).
   - Remembered tempo per exercise (the card's ♩=N is the memory).
   - **Toggle: building ↔ static.** Building = the daily view offers the
     increment bump (increment chosen per exercise, Tempo Ladder's picker);
     static = the tempo never nudges. Flippable at any time — an exercise
     may climb for a year, then plateau on purpose.
   - Passages/tools underneath remain available (the "repair shop" idea
     from the August design survives).
3. **Repertoire roles (ensemble / solo / audition) → stored, not yet
   acted on.** All three behave exactly as the app does today. The role is
   saved for the piece-level coach and audition mode to use when they
   exist. The **phase slider** is captured (at add or at the assessment
   door) and, in v1, does exactly one thing: a piece far enough along the
   slider skips the probe-at-goal assessment (replacing the binary
   played-before question ratified earlier on 2026-09-02).
4. **The assessment upgrades ride along** (already decided, same screen):
   Solid / Shaky / Miss verdict (shaky routes like miss, records the
   truth); the sub-50% chaining branch (offer micro AND macro, framed as a
   short familiarization pass).

## What v1 deliberately does NOT do

- No per-role coach behavior beyond the exercise treatment (Ralph has not
  ratified the sketched prescriptions — see Undecided).
- No tempo-over-time chart (wanted, later).
- No piece-level coach, no audition mode — the roles just wait for them.
- No coach rules reading the phase slider beyond the assessment skip.

## Undecided (Ralph's markup wanted)

1. **Per-role prescriptions.** The sketch (ensemble = deadline-shaped via
   folders, audition = Cold-timer territory, etc.) is Claude's, explicitly
   NOT agreed. Decide role-by-role, later, from real use.
2. **Where the role question is asked** — add-time vs. first-open; what
   batch uploads do (folder default? ask later?).
3. **Slider mechanics** — unlabeled line vs. a few named stops; exact
   threshold for "skips the assessment"; whether the slider should be
   revisitable from the piece screen (proposed: yes, like the toggle).
4. **What the coach eventually does with slider position** (e.g. a
   six-weeks-in piece entering the app mid-learning).
5. **Migration** — what existing pieces get (proposed: nothing until
   touched; the Daily Routine folder's members get offered the exercise
   role on first open).
6. **Whether "maintaining-phase repertoire" (slider at the far right)
   changes anything in v1** (proposed: no).

## Live data: Ralph's whole library is tagged

2026-09-03: Ralph tagged all 46 library items by multiple-choice in one
sitting — see `LIBRARY_ROLE_TAGS.md` for the full table AND eight design
findings from doing it live (folder-based defaults worked for Ralph but he
flagged them as an n=1 hypothesis — suggest-and-confirm only, never silent;
the trail provably can't infer phase — Frenzy vs. Cuban Overture; the role
question needs a skip path; roles are the player's call; new exercises can
start as "building"). Ralph RULED (same day): no fifth "teaching material" role —
music he adds to teach is simply Solo ("I need to learn it in order to
teach it"); the four roles stand.

## Log & design lineage

COACH_SIGNAL_LOG.md: D53, D55, D56, D57, D59, D60, D61, D63, D64, D65, D66.
August design: memory note `project_pfn_daily_exercises_design` (the
commitment-device framing, score-attached norm, metronome-never-stopwatch,
graduation idea — graduation may now simply be "flip the role/edit," open).
Phase-continuum insight (slider, not binary): Ralph, 2026-09-02 — "if I
could choose a spot along a line between totally unfamiliar and
performance-ready… it can be a sliding scale."
