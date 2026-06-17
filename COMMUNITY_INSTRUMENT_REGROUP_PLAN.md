# Community Library — group by real instrument + instrument-card browse

**Status:** planned, not started. Decision locked: **Option B (root fix)** — capture the
real INSTRUMENT (not the transposition) at the source, derive transposition for notation.
Owner: Ralph. Repo: `~/Desktop/COWORK/PROJECTS/APPS/PlayFastNotes/play-fast-notes/`.

## Why
`community_exercises.instrument_id` stores a TRANSPOSITION, not an instrument
(`lib/music/pitch.ts` `INSTRUMENTS`): "concert" = flute/piano/violin; "bb_clarinet"
= "B♭ clarinet / trumpet". Many-to-one with real instruments, so you cannot build a
useful per-instrument library from it. Fix = capture the real instrument; keep
transposition only for notation (it's derivable from the instrument).

## The model
Add a curated REAL-INSTRUMENT list. Each entry carries its transposition + a family
(for grouping). The user picks an instrument; transposition is derived.

`lib/music/instruments.ts` (new), e.g.:
```ts
export type PlayInstrument = {
  id: string;            // e.g. 'clarinet_bb'
  label: string;         // 'Clarinet in B♭'
  family: string;        // 'Clarinet'  ← browse grouping key
  transposeSemitones: number; // feeds writtenToConcert/concertToWritten (pitch.ts)
  clef?: string;         // optional default clef
};
```
Seed (transpositions MUST be verified against `INSTRUMENTS` in pitch.ts):
- Flute (Concert, 0), Oboe (0), Bassoon (0, bass clef), Piano (0), Violin (0),
  Viola (0, alto), Cello (0, bass), Double Bass (0, bass), Voice (0), Guitar (0)
- Clarinet in B♭ (+2, family Clarinet), Clarinet in A (+3, family Clarinet),
  Bass Clarinet (+14, family Clarinet)
- Trumpet in B♭ (+2), Horn in F (+7), Trombone (0, bass), Euphonium (0/bass), Tuba (0/bass)
- Soprano Sax (+2), Alto Sax (+9), Tenor Sax (+14), Bari Sax (+21)  — family Saxophone
- English Horn (+7), Piccolo (0)
- Percussion, Other
**A + B♭ (and bass) clarinet all share family "Clarinet" → one card. Saxes → "Saxophone".**

## Steps
1. **`lib/music/instruments.ts`** — the list above. Helper `instrumentById(id)`,
   `instrumentFamily(id)`. Double-check every transposeSemitones vs pitch.ts.
2. **Exercise Builder** (`app/passage/[id]/rhythm-builder.tsx`) — replace the
   transposition picker (currently from `INSTRUMENTS`) with the real-instrument picker.
   Notation already transposes via `instrument.transposeSemitones`
   (`writtenToConcert`/`concertToWritten` in pitch.ts) — pass the chosen instrument's
   `transposeSemitones`, so the render path barely changes. `LAST_INSTRUMENT_KEY` now
   stores the real-instrument id. VERIFY notation output is unchanged for a known case
   (e.g. B♭ clarinet still +2).
3. **Publish** (`components/ShareExerciseModal.tsx` + `lib/community/exercises.ts`) —
   store the real-instrument id in a NEW column `instrument`. Keep writing the
   transposition into `instrument_id` (derive from the instrument) so existing
   rendering/legacy stays intact.
4. **DB migration (Ralph runs in Supabase Studio — MCP prod writes blocked):**
   `alter table community_exercises add column if not exists instrument text;`
   Add to `db/schema.sql` + the SQLite `lib/db/schema.ts` migration list for parity.
5. **Browse rewrite** (`app/community.tsx`) — replace the flat list + transposition
   chips with **instrument-FAMILY cards** styled like the Tools hub
   (`app/tools/index.tsx`: accent bar + emoji + title + count). Card grid (root) →
   **composer** → **piece (piece_title)** → **exercise** (→ `/community/[id]`). Counts
   at each level. Keep the search box: non-empty query shows flat results (today's
   behavior) and bypasses the drill-down. Blank composer → "Unknown composer";
   blank piece → "Untitled".
6. **Legacy rows** (instrument null — few, library is new): group under "Other", OR
   best-effort map old `instrument_id` transposition → a family. "Other" is fine.
7. `app/community/[id].tsx` — show the real instrument label (family or full) instead
   of the transposition label.

## Notes / gotchas
- Notation correctness is the risk. Verify transpositions before trusting the list.
- Don't break the Exercise Builder's own use of transposition for the on-screen staff.
- tsc + `expo export -p web` must stay clean. Don't push (push = live deploy).
- Edge functions unaffected (no new function). If any added, CORS must allow
  `x-client-info` (web trap).
- Card grid pattern + counts: mirror `app/tools/index.tsx`. Drill-down state =
  `{ family, composer, piece }`; in-content back affordance steps up one level.
