# Per-Piece Practice Coach — Build Plan (v1)

> Design rationale + the full decision history live in the assistant memory note
> `project_coaching_mode` and the session that produced this. This file is the
> actionable spec.

## 1. What it is
A per-piece **"Where do I start?"** recommender for **fast passages**. It reads the
piece's practice data, asks 1–2 fixed diagnostic questions, and routes the player to
**one of the six built tools** with a short, plain-language *why*.

Curated and deterministic — **no LLM, no dialogue, no tapping the score,
instrument-agnostic.** The coach's only job is to route to a built tool + give one
fundamental nudge. It is NOT a technique encyclopedia.

The six tools, by role (the **acquire → consolidate → perform** arc):
- **Tempo Ladder** — build raw speed, same motion, gradually (acquire)
- **Macro-chaining** — rebuild in chunks at tempo (acquire; also the "chunking" tool)
- **Micro-chaining** — isolate & rebuild one spot at tempo (acquire, localized)
- **Rhythm Variations** — even out a running passage / sharpen coordination (refine)
- **ICU** — make it robust under varied tempo + start points (consolidate)
- **Rep Rotator** — perform/retrieve it cold, rotated with other spots (perform)

## 2. Entry point
- A **"Where do I start?"** button on passage detail (`app/passage/[id]/index.tsx`,
  near the `STRATEGIES` list / `openStrategy`).
- New screen: `app/passage/[id]/coach.tsx`.
- Onboarding can hand the first piece straight into it.

## 3. Data changes
- **`pieces.due_date`** — new nullable `bigint` (epoch ms). Supabase migration (run in
  Studio) + `lib/db/schema.ts` (native SQLite) + both passages repos
  (`lib/db/repos/passages.ts` + `.web.ts`): add the field, a getter, and a setter.
  Powers urgency; later a "due in N" chip + library sort; prefills Tempo Ladder
  `goal_date`.
  ```sql
  alter table pieces add column if not exists due_date bigint;
  ```
- **Miss capture** (forward-only, COACH-INTERNAL — never rendered in the practice log):
  - Tempo Ladder: add a `misses` counter, bump it in `onMiss`, include it in the
    session `data_json` (`hooks/useTempoLadderSession.ts`).
  - Rep Rotator: add `totalAttempts` per passage (`SpotState`), include per passage in
    the finish log (`app/interleaved.tsx`).
  - No schema change (free-form `data_json`).
- **No new progress table.** Coach reads `practice_log`, `tempo_ladder_progress`,
  `strategy_last_used`. Coach flags (e.g. "seen") → `settings`.
- **Not needed for v1:** instrument, `coach_profile`/character (selector doesn't use
  even-vs-mix).

## 4. The silent read (all capturable, no questions)
Per-strategy usage + recency (`practice_log`, `strategy_last_used`) · tempo vs. goal +
stall + miss-rate (`tempo_ladder_progress` + `data_json`) · `due_date` · any open
`remindNext` note (surface it in the opener, in the player's own words).

## 5. The fixed question tree (verbatim)
**Screen 1 — always:** "What's getting in your way right now?"
- ⓐ I can't get it up to speed
- ⓑ It's uneven or lumpy when I speed up
- ⓒ One spot keeps falling apart
- ⓓ I can play it, but not reliably
- ⓔ I'm having trouble coordinating things (hands, tongue + fingers…)
- ⓕ I'm not sure — let me play it first

**Follow-ups (fixed per branch):**
- ⓐ → "same motion, just needs to be faster" / "a different motion once it gets fast"
- ⓑ → "pretty much throughout" / "mainly one stretch"
- ⓒ → "near the beginning" / "in the middle" / "near the end"
- ⓓ → "shaky even on its own" / "fine alone, but falls apart when it counts"
- ⓔ → *(no follow-up — straight to recommendation)*
- ⓕ → "crashed at one spot / ran away / messy / fell apart randomly / honestly fine"
  → reroutes into ⓒ / ⓐ / ⓑ / ⓓ / maintenance

## 6. The selector (routing)

| Challenge | → Tool |
|---|---|
| ⓐ same motion, **early** (little laddering) | Tempo Ladder |
| ⓐ same motion, **laddered a lot / plateau** | ICU |
| ⓐ different motion at speed | Macro-chaining |
| ⓑ throughout | Rhythm Variations |
| ⓑ one stretch | Rhythm Variations (on that stretch) |
| ⓒ spot | Micro-chaining (beginning→forward / middle→outward / end→backward) |
| ⓓ reliability | **ICU ⇄ Rep Rotator rotation** by recency (ICU last → Rep Rotator today; Rep last → ICU; neither → ICU first) |
| ⓔ coordination | **Rhythm Variations** + universal nudge: *"isolate the two parts that aren't lining up, then put them back together"* |
| tried everything + plateau | Macro-chaining (rebuild in chunks) + keep ICU |
| ⓕ "fine" | Rep Rotator (maintenance) |

**Cross-cutting:** moves are **finish · tune · advance · drop-back** (not always
"switch tools"). Due ≤ 1 week → triage wording. Don't re-push a just-completed tool.

## 7. Recommendation rendering (the voice)
- Shape: **affirm what they've done → name the situation → name the tool → one-line
  method.**
- Rules: **never** say what *not* to do; lean, no lectures; sentence case; warm.
- Controls: a decisive **Start [tool]** button + a **"Not quite? → [alternative]"**
  escape hatch for unresolved forks.
- Reliability uses the **rotation** wording ("today do X, keep rotating the two").
- Coordination's nudge is an unguided "try this," **loggable** (free-text
  `practice_log.strategy`, e.g. `coordination` + technique in `data_json`).

## 8. Explicitly deferred (NOT v1)
Instrument capture + instrument-specific drills (Bonade/Molly) · bounded-LLM rationale
layer · the multi-spot "teacher's clipboard" · log-a-run-through · chunking as a
separate tool (**Macro-chaining covers it**) · audition mode / cross-piece history ·
mental-practice nudge.

## 9. Build order
1. **Data:** `pieces.due_date` migration + repo wiring; miss-capture in Tempo Ladder +
   Rep Rotator.
2. **Coach logic:** `lib/coach/` — the fixed tree + selector + copy (port from the
   validated mock-up).
3. **Coach screen:** `app/passage/[id]/coach.tsx` rendering the tree + recommendation;
   wired to the passage-detail entry button.
4. **Polish:** due-date capture/confirm UX; surface the `remindNext` note.
5. **Verify:** click through every branch logged-in; confirm misses log silently and
   never render. `tsc --noEmit` + `expo export` clean before any deploy.
