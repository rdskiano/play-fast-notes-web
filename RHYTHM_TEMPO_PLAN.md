# Rhythm-exercise tempo relationship (B-018) — calibration plan

_Status 2026-07-14: first data point in (3/8). Waiting on 2/4 + 5/8 + 7/8 numbers — 2/4 is the discriminator. Nothing built yet._

## Calibration data so far (Ralph, 2026-07-14)

Reference passage: 4/4, running 16ths, **goal ♩ = 140** (his wording: "should
eventually be 140" — numbers below appear anchored to the GOAL, not the current
practice tempo; confirm when building).

- **Anything in 3/8** (content-independent — his phrasing, one dial per meter):
  **♪ = 210**, i.e. 70 per bar. First said 200/72, self-corrected to 210/70.

What 210-to-the-eighth pins down (worked math): exercise 16ths = 420/min = 75% of
the passage's 560/min; one 3/8 bar = 0.857 s = exactly TWO passage beats. Both
readings fit 3/8 equally — 210 = 1.5 × 140 either way. "Content-independent
within a meter" kills Rule A (fastest-note anchoring). Survivors:

- **Notation-anchored (B′):** written 16th at 75% of passage 16th speed
  (dial = 0.75 × denom × T / 4). Predicts 2/4 → ♩ = 105; 5/8 → ♪ = 210; 7/8 → ♪ = 210.
- **Bar-anchored:** one exercise bar = two passage beats. Predicts 2/4 → ♩ = 140;
  5/8 → ♪ = 175 (bar of 5 in 2 beats); 7/8 → ♪ = 245.

The 2/4 answer (105 vs 140) decides between them; 5/8 + 7/8 confirm. The ¾ factor
itself may be goal-relative ("variations sit at 75% of goal") — worth asking
whether at goal-reached he'd move the variations up too.

## The problem (Ralph, 2026-07-14)

In Rhythm Variations (and the Exercise Builder), the playback tempo "is significantly
different from what I would choose" relative to the passage's tempo. He suspects the
meter changes between patterns are involved. He's right, twice over:

1. **No link to the passage.** `app/passage/[id]/rhythmic.tsx` and `rhythm-builder.tsx`
   both hard-code `useMetronome(80)`. The passage's tempo (now stored in
   `pieces.performance_tempo`, B-013) is never read.
2. **The dial means a different real speed in every meter.** Playback BPM counts the
   time signature's DENOMINATOR (`secondsPerQuarter = (60/bpm) * (denom/4)` in
   `useMetronome.web.ts` `rhythmTick` / native `scheduleCycle`). At the same dial
   number, a 3/8 pattern's sixteenths run at HALF the speed of a 2/4 pattern's.
   Grouping-4 patterns span 3/8, 2/4, 5/8, 7/8 — so stepping → through patterns
   without touching the dial lurches the felt tempo repeatedly.

## Candidate anchor rules (what stays constant across meters)

Let T = passage performance tempo (quarter-note BPM), fast notes assumed
4-per-beat sixteenths (d16 = 15/T seconds). Dial = denominator-units/minute.
s_q = a token's duration in quarters (16 = 0.25, 8 = 0.5, 8. = 0.75, 32 = 0.125…).

- **Rule A — fastest note at passage speed.** The pattern's shortest token plays at
  the passage's fast-note speed. `dial = s_min × denom × T`.
- **Rule B — written sixteenth constant.** Any notated 16th = passage 16th.
  `dial = denom × T / 4`. (Same as A when the shortest token IS a 16th; differs on
  patterns with 32nds — A halves the dial vs B — and on all-longer patterns like
  5/8 `q 8 8 8`, where A doubles it.)
- **Rule C — group total time preserved.** The N-note pattern spans the same time as
  N passage sixteenths. `dial = denom × D_q × T / N` (D_q = pattern total in
  quarters). Gives absurd values for long-note patterns (7/8 `q 8 q q` → 7T) — if
  Ralph's numbers are sane there, C is dead.

It may also be none of these (e.g. "variations sit a notch under target"): fit
whatever the data says. **Don't show Ralph the predictions before he dials — blind test.**

Worked predictions at T = 120 for the calibration set (grouping-4 list positions;
patternsByGrouping keeps catalog order):

| # | pos | id | meter | notes | A | B | C |
|---|-----|----|----|-------|---|---|---|
| 1 | 1 | 25 | 3/8 | 8 8 16 16 | 240 | 240 | 360 |
| 2 | 5 | 29 | 3/8 | 8. 16 16 16 | 240 | 240 | 360 |
| 3 | 9 | 33 | 2/4 | 8. 16 8 8 | 120 | 120 | 240 |
| 4 | 12 | 36 | 2/4 | 16 8. 8 8 | 120 | 120 | 240 |
| 5 | 15 | 39 | 5/8 | q 8 8 8 | 480 | 240 | 600 |
| 6 | 17 | 41 | 5/8 | q 8. 16 8 | 240 | 240 | 600 |
| 7 | 19 | 43 | 7/8 | q 8 q q | 480 | 240 | 840 |
| 8 | 21 | 45 | 7/8 | q. 8. 16 q | 240 | 240 | 840 |
| 9 (bonus) | grouping 3, pos 5 | 5 | 2/8 | 8. 32 32 | 120 | 240 | 240 |

⚠️ Some predictions exceed the dial's clamp (MetronomePanel BPM_MAX 240, engine
setBpm max 300). If Ralph's chosen numbers pile up at the ceiling, that's a finding
in itself; the eventual auto-set may need to drive the loop rate directly instead
of through the user-facing dial.

## Calibration protocol (Ralph, ~15 min with clarinet, web or iPad)

1. Pick a real passage with a known goal tempo where the fast notes are
   four-to-the-beat sixteenths. Note that tempo (call it T).
2. Open it → Rhythm Variations → grouping **4**.
3. For each pattern in the set: navigate with → (positions above), tap **▶ Loop**,
   open the **metronome tab** and move the dial/± (slider after the next web push)
   until the exercise is at the tempo he'd actually assign. Don't run the click.
   Write down: pattern # → dial number.
4. Bonus row: switch grouping to 3, go to position 5 (8. 32 32 in 2/8), repeat.
5. Report T + the nine numbers back in a session.

## After the data

- Fit A/B/C (or whatever pattern emerges) to the numbers.
- Build: on entering Rhythm Variations / Exercise Builder, read
  `pieces.performance_tempo`; on every pattern/exercise change, recompute and set
  the tempo per the rule so the FELT speed stays constant (dial number changes,
  music doesn't). Open question for that build: passages whose fast notes aren't
  sixteenths (triplet/sextuplet runs) — where does the note-value assumption come
  from? Possibly the chosen grouping, possibly a per-session question.
