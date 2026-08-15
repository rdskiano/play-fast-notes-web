# Coach Signal Log — live working session

**Purpose:** Ralph practices something genuinely new while narrating his decisions.
For each decision we log three things:
1. **What Ralph did** (and why, in his words)
2. **What the app would have known** at that moment from reps + tempos alone
3. **Verdict:** could a deterministic rule have made the same call? (YES / PARTLY / NO — and what signal was missing)

The NO rows are the product: they mark where the rep-and-tempo trail is not enough
pedagogical signal, and what extra input (if any) the coach would need.

Also logging **app friction** along the way (add-music path onward), since the session
starts from inputting the music.

---

# 2026-08-14 — D42 (STANDING): Ralph does not yet trust the coach's advice

Pinned at the stand after his first real day using the D38 one-modal prompt +
suggestion rules. His words: "Mechanically, everything is working. I just am not
sure about the logic behind the scenes."

- **What this means for the rules:** every routing/proposal rule in
  `lib/coach/suggest.ts` + `proposeNote` is PROVISIONAL. The rules encode guesses;
  none has been validated against Ralph's judgment on resistant material.
- **How the coach gets educated:** NOT by his practicing (the rules don't learn) —
  only by his disagreement reports landing here as D-entries and becoming rule
  changes he signs off on. When Ralph reports on a coached session, ask whether
  the suggestion felt right, and log the answer.
- **Standing instruction:** don't present the coach's pedagogy as validated,
  in-app or in conversation. This is the live thread of the July decision to
  build transparent history + a coach disagreement log before trusting anything
  deeper.

---

**Date:** 2026-07-27
**Piece/excerpt:** *Frenzy: A Short Symphony for Orchestra* — John Adams (clarinet part)
**Device:** iOS app on iPad ("if I even get that far" — iPad add-music friction is itself a known sore spot; log it)
**Truly new to Ralph?** YES — never seen it before. Ideal test subject.

---

## Friction log (app UX moments)

- **Pre-session ritual:** closed + relaunched the app 3× just to be sure the latest OTA
  update applied. (Known quirk: OTA needs two relaunches; a real user would never know
  this and shouldn't have to. Owner-only pain today, but worth remembering if OTA
  cadence ever matters to users.)

- **F1 — In-app scanner fails on bound scores (BLOCKER-level friction).** Scanning the
  bound Frenzy part: edge detection doesn't find the center fold, so facing pages come
  in as one un-split spread. Genius Scan handles this; ours doesn't (we use the stock
  iOS document scanner). Ralph's verdict after a few pages: "I know I won't use this."
  → Product take: don't out-scan dedicated scanner apps — make the
  scan-elsewhere-then-import path first-class (Genius Scan → save PDF to Files →
  Add full part → pick PDF works TODAY and should probably be the recommended flow).
- **F3 — Metronome panel won't dismiss on tap-outside.** Ralph's instinct every time:
  adjust metronome → tap the page/score to close it. Reality: only re-tapping the
  metronome icon closes it. Small, repeated, every-session friction. Candidate fix:
  tap-outside (or tap-on-score) collapses the open tool panel — with care that a
  score tap doesn't ALSO register as a marker/pencil action.

- **F5 — BUG (iPad, native build): pencil tool palette flashes and vanishes; exit
  reports "could not save your annotation" with no annotation made.** Repro: practice
  screen for Measure 22 → tap Pencil tool → palette slides up from bottom, immediately
  disappears → tap X to exit → error alert. Blocks all annotation on iPad in this
  state. (Spun off as its own follow-up task.)

- **F6 — Box labels collide when passages stack.** With tightly stacked passage boxes
  (a symphony page marked measure-by-measure), each box's NAME (upper-left) overlaps
  the PERCENT-DONE badge of the box above it. Ralph's proposed fix: put the
  percentage inline immediately after the name (one chip, one corner) instead of two
  separate corner decorations. Only surfaced because tonight produced real
  measure-density marking — light marking never collides.

- **F7 — Accidental "Done" mid-ladder (measures 25/26), no way back.** Ralph fat-
  fingered Done when he meant to advance the tempo; the session ended and he had to
  save-finish-and-restart. He notes the SAME slip has bitten him in another strategy
  before — this is a pattern, not a one-off: terminal buttons living next to
  high-frequency buttons, with no undo. Fix candidates: (a) mid-session Done asks
  one-tap confirm (only when reps have been logged this stint), (b) physically
  separate Done from the advance control, (c) a "resume where I was" that restores
  the exact rung/rep state so a slip costs two taps, not a ritual. Check: does
  today's resume restore his rung correctly? → Checked live: resume put him back on
  (or possibly one above) his rung — he didn't notice precisely, which itself is fine
  news: the slip costs taps and mood, not progress. Downgrades F7 from
  progress-loser to pure button-placement fix.

- **F8 — Web copy leaking into iOS: "Space or foot pedal = clean" hint on iPad.**
  The keyboard-shortcut hint line was written for laptop web and shows as-is in the
  native iPad app, where there's no spacebar in sight. (Technically a paired BT
  keyboard/pedal does send key events on iPad, but the copy reads wrong.) Fix:
  platform-specific copy — iPad says "Foot pedal = clean" (pedals still work there,
  they pair as keyboards) or hide the hint when no hardware keys have been seen.

- **F9 — Step-up flash shows the wrong number for a beat.** Flow: banner says "Ready
  to step up to 80 BPM" → tap Step Up Tempo → for a moment the overlay shows 85
  before it closes. The underlying state increments while the overlay is still
  on-screen, so the user glimpses the NEXT-next rung. Practice tempo ends up correct
  — pure display-order flicker, but visually confusing at the exact moment of a
  small win. Fix: freeze the overlay's displayed number (snapshot it) and let state
  update after dismissal.

- **F2 — Scans are trapped: no PDF export/share from the app.** The wasted scan can't
  be reused anywhere else, which stings extra when the scan itself was the failure.
  Data-trap feeling = trust cost. Candidate fix: share/export on documents.

## Decision log

**D2 — First act with a new piece: reconnaissance, not playing.**
- **What Ralph did:** With the PDF in, his next step is to LISTEN to a recording and
  work out how fast each SECTION goes — normally written by hand on the score.
  He floated the idea himself: app could auto-open tap-tempo while listening and let
  him label each section with its tempo.
- **What the app could have known:** Nothing — this is pure human input, but it's
  input Ralph GENERATES ONCE PER PIECE, per section, before any practicing.
- **Verdict: validates + reshapes the evaluation design.** "How fast does it need to
  go?" is not a per-passage question for a pro — it's a listening pass over the whole
  document, stamping tempos section by section. Design shape: in the document viewer,
  a listening mode = tap-tempo open + tap a spot on the score to stamp the current BPM
  there (sections already exist as markers). Any passage boxed later inside that region
  INHERITS its goal tempo → evaluation question 3 answers itself. The student
  "I'm not sure → listen + tap" path and the pro workflow turn out to be the same
  feature. (Today's analog: he can tap-tempo in the metronome and handwrite the number
  with the pencil tool — works now, but the app can't read handwriting, so stamps
  should be structured data.)

**D2a — Recording unavailable (piece too new) → falls back to the score's printed
tempo markings.**
- **Design implication:** the "listen + tap" path can FAIL (new/obscure repertoire, no
  recording exists). The fallback is the score itself — modern scores often print
  exact BPM (Adams-style "quarter = X"), older ones print tempo words, which is what
  the tempo-word ladder (Largo→Vivace + BPM ranges) already covers. So the goal-tempo
  question needs THREE honest paths: printed marking → recording + tap → tempo-word
  best guess. Order matters: "check your score first" is the cheapest and most
  authoritative.

**D3 — Sections used as tempo stamps, unprompted.**
- **What Ralph did:** First markup act on the new PDF: added a section marker by
  tapping directly ON the printed tempo (♩=116) at the top of the piece.
- **What this means:** He reinvented the D2 "tempo stamp" design with the existing
  section feature, by hand, without being told. Sections ARE the natural home for
  per-region tempo. Today the tempo lives only in the section NAME (a string the
  coach can't use). Cheap bridge before any new UI: parse a number out of section
  names ("116" / "♩=116") and treat it as that region's goal tempo. Long-term: a
  structured tempo field on sections.

**D4 — Passage granularity: many small boxes vs one big one.**
- **What Ralph did:** Page 1 has several short tricky passages. He genuinely wrestled:
  one combined passage (tracking sub-phrases via the practice log) or one box per
  small passage? Chose: ONE BOX PER SMALL PASSAGE.
- **What the app could have known:** Nothing — pure musical-structure judgment. No
  rule can make this call. But the app currently gives ZERO guidance at the moment of
  drawing a box, and even Ralph (who built it) hesitated. A student would be lost.
- **Verdict: NO (rule can't decide) — but one line of embedded guidance could carry
  the user's decision:** e.g. "Box the smallest chunk you'd drill on its own." This is
  the guidance-into-defaults thesis in miniature.
- **⚠️ Design consequence for the evaluation ritual:** fine-grained marking means a
  pro creates MANY passages per sitting (page 1 alone = several). The find-your-tempo
  evaluation therefore must fire on FIRST PRACTICE of a passage, never at marking
  time — and goal tempo must inherit from the section stamp (D3) — or marking a
  symphony becomes dozens of back-to-back questionnaires. Marking must stay cheap.

**D5 — Seven passages marked, named by measure number: 20, 21, 22, 24, 25, 26, 27.**
- **What Ralph did:** Granularity landed at essentially ONE MEASURE per passage.
  Naming convention = bare measure numbers. (23 skipped — presumably easy/rests.)
- **What the app could know:** More than expected. (a) Names are parseable numbers →
  ordering + adjacency, same trick as tempo-in-section-name (D3). (b) Even without
  names, the app HAS the box coordinates — it can see these are 7 near-adjacent boxes
  in the same section of the same page(s). (c) Adjacent sibling passages practiced in
  the same era are natural candidates for LINKING later — macro-chaining's whole
  premise ("link mastered chunks"), or a pre-seeded Rep Rotator set of all 7.
- **Verdict: PARTLY.** A rule can't choose the granularity (D4), but once the boxes
  exist a rule COULD infer structure from geometry + names and pre-build the
  "rotate/link these" suggestion a human would eventually want. Watch whether Ralph
  in fact ends the sitting by rotating or chaining these seven.

**D6 — First move on a fresh passage: probe AT performance tempo (116), not find a
comfortable tempo.**
- **What Ralph did:** Before any calibration, try the measure at goal tempo to "see if
  it's even possible."
- **⚠️ This REVISES our evaluation design.** We drafted: find your clean-easy tempo →
  prove it → then goal. The pro's actual first question is the reverse: "how far is
  this from POSSIBLE?" Efficient triage — if the probe is clean, the passage needs no
  practice plan at all and never enters the queue. Suggested revised ritual:
  (1) probe once at goal (known from section stamp) → clean? DONE, passage marked
  performance-ready; (2) not clean? → find your clean tempo, prove with one rep →
  now the coach has both anchors AND a felt sense of the gap.
- **What the app could have known:** goal tempo (116, via D3 inheritance). A rule
  could absolutely propose the goal-probe first — fully codable.
- **Verdict: YES — and better than our hand-designed version.** The rule we should
  write is the one Ralph just performed.

**D7 — First coach comparison (protocol: Ralph decided first, then peeked).**
- **Ralph's call:** probe at 116; expected to then need a clean-tempo baseline and
  climb — tempo-ladder-shaped work.
- **Coach's call:** noted the piece isn't due for a long time + he's just getting
  started → recommended TEMPO LADDER.
- **Row: AGREEMENT on the destination (tool family), miss on the opening move** —
  coach skips the goal-probe triage (D6) and assumes the passage needs work instead
  of testing whether it does. Also note the coach *asked* for inputs the app should
  already have had (due date = Week 5 folder / D1; getting-started = zero practice
  logs on file).
- **Verdict: the deterministic coach is directionally right on its first live test.
  The gaps are (a) no goal-probe step, (b) it interviews the user for facts the app
  already knows.**

**D8 — The probe, the baseline, and the comfort buffer (Measure 20).**
- **What Ralph did:** (1) Probed at 116 → couldn't play it. (2) Found 80 feels like a
  good clean starting tempo. (3) KEY EXPERT MOVE: won't start the ladder at 80 — will
  set it near 70, deliberately BELOW his clean tempo, "to be very, very comfortable
  for the first couple of repetitions."
- **What the app could have known:** After the probe + the 80 discovery, everything:
  goal 116 (section stamp), clean ≈ 80 (proof rep). The buffer is the new knowledge —
  experts START BELOW their clean tempo, they don't start AT it.
- **Verdict: YES — fully codable, and it upgrades the ritual again.** Rule: ladder
  start = proven clean tempo − ~10–15% (here 80 → ~70). So the evaluation hands off
  to the ladder with ALL THREE numbers set: start (clean − buffer), goal (section
  stamp), current position. The user configures NOTHING. Exact buffer size (fixed %?
  fixed BPM? Ralph-tuned?) = pedagogy call for Ralph.
- **Open sub-question (asked):** what KIND of failure at 116 — fingers, articulation,
  rhythm, register? This is the "nature of the trouble" input (see D7 gap / spacing
  notes) that tempo data alone can't see.

**D9 — Self-coaching the trail can't see: "this passage is forte."**
- **What Ralph did (aside, mid-rep at 80):** caught himself playing too soft and
  invoked his own teaching rule — ALWAYS practice at the written dynamic, even in
  slow/rhythm work, because superimposing dynamics after the technical work is hard.
  He floated a "are you at the right dynamic?" pop-up.
- **What the app could have known:** Nothing. First clear **NO** row of the night:
  rep-and-tempo data is blind to QUALITY dimensions (dynamics, tone, articulation) —
  the whole self-monitoring checklist an expert runs in parallel. A rules coach built
  on the trail alone can never coach this.
- **BUT — the fix isn't a data source, it's CONTENT.** Ralph's pedagogy externalized
  as tiny ambient reminders ("coach whispers"): one small line on the practice screen
  per session — "Forte passage? Practice it forte." — rotating through his teaching
  heuristics. NOT a modal (we're in the middle of killing pop-ups). Existing homes:
  the passage reminders/notes banner + the post-session "note for next time" prompt
  already surface notes at exactly the right moments; a dynamics whisper could ride
  those rails. Passage-specific version: user tags a passage "forte!" once and it
  shows during every rep.

**D10 — Ladder config as actually chosen (Measure 20): Step mode · 5 clean reps ·
climb +5 · start 70 · goal 116.**
- Buffer confirmed in the wild: proved clean ≈80, started at 70 (−12.5%). Chose FIVE
  clean reps, not the app's default 3 — for a hard passage in a long-runway piece he
  wants more proof per rung. Candidate rule input: rep target scales with distance
  from goal and/or runway (his pedagogy to confirm).
- **E1 — RALPH'S STATED EXPECTATION (on record before touching passage 2):** "Until I
  change it, the goal tempo will remain 116 every time I click another passage within
  this section." I.e., he expects section-level goal-tempo inheritance — the D3
  design — to ALREADY exist. Current app almost certainly stores tempo config
  per-passage, so Measure 21 will likely come up blank/default. If so: the app
  violates its owner's own mental model = strongest possible case for the pinned
  prefill/inheritance fix.

**D11 — The merge: Measure 20 + 21 join; granularity turns out to be FLUID.**
- **What happened:** Because a passage spanning a line-wrap must be boxed as whole
  lines, Measure 21 was visible inside Measure 20's crop — and Ralph found himself
  simply playing through 21. Decision: rename 20 → "20 and 21," delete passage 21.
- **Why he over-chopped in the first place (his own diagnosis):** measure-per-box was
  driven by TOOL constraints — mixed-rhythm practice across rests is unmanageable —
  not by the music itself. While practicing he instinctively re-joins neighbors:
  "I'll find a way to make it work later."
- **What the app could have known:** the overlap! Passage 21's region sits inside
  passage 20's crop rectangle — pure geometry the app already stores. Rule: "this
  passage's crop contains another marked passage → offer practice-together / merge."
- **Verdict: PARTLY-to-YES.** D5's prediction (he'd link neighbors this sitting)
  confirmed within ~20 minutes, though triggered by crop geometry rather than
  mastery. Two design outputs: (a) a real MERGE operation (rename-and-delete loses
  the deleted passage's history; merge should absorb it), (b) passages must be
  treated as FLUID — split for rhythm work, joined for continuity — not fixed
  objects. Granularity is a moving target across the life of a piece.

**F4 (filed with decisions for context) — "What's most important next time?" prompt
left BLANK.** After 3 rungs (70→80), the post-session note prompt asked for a
reflection and even the app's builder had nothing: "I don't know, actually." An open
text box at a tired moment demands articulation the user doesn't have. Candidate:
offer one-tap chips (e.g. "keep climbing" / "rhythms" / "dynamics" / skip) — or let
the coach PROPOSE the note and ask yes/no. Free text stays as the power path.

**Session stint note:** ladder stopped mid-climb at 80 after 3 clean rungs — a stint,
not a to-goal run. 80 = exactly the earlier proven-clean tempo (D8): the sub-clean
buffer rungs served as warm-up/consolidation, and he banked progress AT his baseline.
Ladder progress persists per-passage, so next session resumes at 80 (rename keeps the
same passage, so the merge doesn't lose this).

**E1 — VERDICT: CONFIRMED, live.** Measure 22 → Tempo Ladder → start/goal defaulted
to 60/120. Ralph, the app's own builder, was "immediately frustrated" and hand-typed
70/116 again. The app violates its owner's mental model exactly as predicted.
- **Bonus finding — he reused the WHOLE config, not just the goal:** start 70, climb
  5, reps 5, goal 116 — all copied from sibling Measure 20, with NO fresh probe of 22.
  Expert shortcut: neighboring passages in the same section ≈ similar difficulty →
  start where the sibling started.
- **The prefill rule this implies (supersedes goal-only inheritance):** default a new
  ladder config to the most recent SIBLING config in the same section (goal from
  section stamp; start/climb/reps from the last sibling), user just edits if wrong.
  For most passages that's ZERO typing. This is the pinned prefill fix, now with a
  confirmed live failure + an exact spec from observed behavior.

**D12 — Measure 22: identical stint (70→80). Plus a scan-lifecycle insight.**
- Sibling passages behaved identically two-for-two — supports the D8/E1 rules
  (buffered start, sibling-config prefill) generalizing within a section.
- **Scan-lifecycle:** Ralph used to scan parts only AFTER 2–3 rehearsals (so the scan
  matched the performance part). Practicing months ahead means scanning EARLY — so
  the scanned image carries stale pencil markings (someone else's fingerings) he
  wants gone, and later the real part will accumulate NEW markings the scan won't
  have. Two feature shapes: (a) a white-out/eraser preset on the pencil tool (his own
  instinct: "draw in white"); (b) longer-term, "replace this page's scan" that keeps
  the marked boxes (regions are stored in source-page pixels, so a same-scale rescan
  could preserve them). Rental/loaned orchestral parts make pre-marked scans the
  NORM, not the exception.

**D13 — Measure 24: same routine, three-for-three.** Same config, same stint shape.
The session has become literally rule-shaped: probe → buffered start → climb to
baseline → bank → next sibling. Every repeat is another hand-typed 70/116 the
prefill fix would have erased.

**D14 — The path NOT taken tonight: what happens when he's stuck (hypothetical).**
- Measure 24 identical again; Ralph flagged the limit of tonight's data himself:
  everything fell under the fingers, so ZERO stuck-state behavior was observed. His
  stated instinct if stuck: slow down until playable.
- **His proposed rule (his own words, unprompted):** if the app senses repeated
  misses at one tempo — he floated "your fourth miss at a given tempo" — prompt to
  lower the tempo. In-session miss counts are data the tools already collect; the
  intervention is fully codable. Threshold = pedagogy call (and could later be tuned
  from data). Note today's ladder does the OPPOSITE of an expert: on a miss it just
  resets the clean count and leaves you grinding at the same rung forever.
- **⚠️ Honesty flag for the whole log:** every YES verdict tonight came from the EASY
  path (probe→buffer→climb→bank). The hard path — stuck, frustrated, course-correcting
  — is still unobserved. Needs a future working session on genuinely resistant
  material (later Frenzy sections?) before the coach rules can claim coverage.

**D15 — Session close: the bottom of the page, and what tomorrow should bring.**
- **Natural stopping point = a page.** The sitting ended at a physical boundary (end
  of page 1), not a timer or a rep count.
- **Motivation signal:** seeing ALL passages at the SAME completion percentage was
  actively satisfying — "makes me feel like I've accomplished something." Uniform
  sibling progress is a reward surface; a section-level progress readout would
  amplify it.
- **The open question he named:** breadth vs depth — keep refining these passages or
  move on and bring others to the same level? "Remains to be seen." This IS the
  day-two problem the coach exists to answer; unresolved by tonight's data.
- **His hoped-for coach behavior, stated unprompted:** next time he returns to these
  passages, INTRODUCE INTERFERENCE/VARIATION — randomized-cluster ladder mode, or
  ICU. He considered writing himself that note in the "next time" prompt (see F4 —
  hours after leaving it blank, he now knows what it should have said).
- **The rule this implies (textbook contextual-interference pedagogy, fully codable):**
  after N consistent same-tool stints that bank progress at a plateau (tonight:
  blocked step-ladder work, all siblings at 80), the coach's next-session suggestion
  flips to a variation tool (cluster / ICU / rotation across the sibling set — which
  also finally closes the D5 prediction). Session 1 = blocked & buffered; session 2 =
  varied & interleaved. Ralph to confirm as his pedagogy, but he literally asked for
  it himself.

**D16 — (post-close aside) A piece-level "what should I practice?"**
- Ralph noticed there's no per-piece/per-document coach that "takes stock." His own
  objection: it seems to require marking EVERY passage up front (unrealistic), or
  more user input.
- **Counterpoint from tonight's own data:** he DID mark all of page 1 before playing
  a note — recon-first is his natural rhythm, just page-by-page, not whole-part.
  And the piece-level view doesn't need total coverage to be honest: it can
  aggregate what EXISTS (sections + stamped tempos + marked passages + completion %
  + last-touched + due date from the folder) and state its blind spot plainly
  ("pages 2–5 unmarked — recon them next?"). Coverage itself becomes a signal.
- This is the same object as D15's breadth-vs-depth question: the piece dashboard IS
  where the day-two answer lives ("bring Measure 27 up to its siblings" / "introduce
  variation on page 1" / "recon page 2"). Parked as design direction, not urgent —
  Ralph's own call.

---

═══════════════════════════════════════════════════════════════════════

# SESSION 5 (2026-08-14) — narrated scribe session, planned as the
# "teach the coach" pass on resistant material. Ralph practices + narrates;
# entries logged live. No fixes built mid-session.
#
# POST-SESSION BUILD BATCH (same day, typecheck + web export clean, NOT
# shipped, NOT click-tested by anyone): F19 evaluation screen shows the
# zoomable passage under every step · F20 resume prefill honors a banked
# tempo below start + NO durable writes until the first rep (start-persist
# removed in step AND cluster branches; dial-persist gated on touchedRef) ·
# F21 fresh empty exercise soft-deletes on exit (fresh=1 param from
# rhythm-list) · D45 rest palette replaced by the single "Skip a note" key
# (glyph tables/modes/dot removed) · D46 slow-down modal (3 misses, no
# clean, step mode, not guided; −5/−10/−15/−20 dial the metronome; No
# thanks is final for the session). Still open: D44 pill meaning, D47
# rotator rescue (waits on D46), D48 chaining decision.

**F19 — ⚠️ The evaluation flow hides the music it asks you to play.**
- **What Ralph hit:** on a first-time passage, "Ready to practice?" opens the
  evaluation, the tempo loads correctly, and the probe asks "Can you play it?"
  — but the passage image is nowhere on screen. Same at the find-your-clean-tempo
  step. He literally cannot see the notes he's being asked to play, so the probe
  answer defaults to "not yet" for the wrong reason (can't see it ≠ can't play it).
- **Why it matters for the coach:** the probe and the clean-tempo hunt are the
  coach's two measurement anchors (D6/D8). If the player answers them without the
  score in front of them, the measurements are junk — this quietly corrupts the
  very trail the coach reasons from.
- **Ralph's proposed fix (his words):** put the passage underneath what's
  currently on that page — i.e. render the passage crop below the step content,
  the way the practice tools all show the score. Every other screen that asks
  for a rep shows the music; the evaluation is the odd one out.
- **Status:** logged, not built (scribe-session rule). Build after the session.

**D43 — D14 observed live at last: too fast at the rung → his instinct was to
EXIT the session, when the dial-down affordance already exists (and he didn't
know it).**
- **What happened:** goal 100, ladder rung 70, can't play it. Ralph's plan:
  "exit out of the tempo ladder and turn the tempo down" — a full
  quit-and-reconfigure round trip. Mid-sentence he pivoted to an experiment:
  "what happens when I turn the metronome down WITHIN the tempo ladder?" and
  dialed to 50.
- **What the app actually does:** the right thing, already. The
  click-is-the-truth rule (useTempoLadderSession, built after the Session-3
  played-60-banked-80 incident) makes the rung FOLLOW the dial: streak resets,
  cleans credit at the sounding tempo, resume point banks honestly. Step mode
  only.
- **The finding: a discoverability hole, not a missing feature.** The BUILDER
  of the app did not know the escape hatch existed at the moment he needed it —
  no student will ever find it. D14's "repeated misses → offer to drop tempo"
  should therefore be a SURFACING rule, not new mechanics: after N misses at a
  rung (D14's threshold, ~4, still TBD), say "Too fast? Turn the metronome
  down — the ladder will follow you." The machinery is done; only the whisper
  is missing.
- **Also feeds D40/D8:** his 70 start came out ~30% under goal and was STILL
  unplayable — first live datapoint of a ladder start that was too HIGH on
  resistant material (every prior start-tempo rule came from easy material).
  Watch where his clean tempo actually lands today vs the handoff's guess.
- **Status:** watching what happens at 50; wording/threshold are Ralph's call
  after the session.
- **VERIFIED LIVE (same sitting):** dialed to 50 → 5 clean → 5 clean at 55 →
  practice log correctly says "finished tempo ladder at 55." Click-is-the-truth
  works in real use on resistant material. Ralph, unprompted: "that's great."

**D44 — The passage pill shows the RESUME point, Ralph read it as the
ACHIEVED point.**
- **What happened:** after the 55-clean session the score-page pill said 60%.
  His read: "I'm at 55 out of 100, it should say 55."
- **Mechanism (not a math bug):** pill % = tempo_ladder_progress.current_tempo
  / goal (passageStatus repos). Five cleans at 55 step the ladder UP and bank
  60 as the next rung — so the pill reports where he'll START next time, while
  the log reports what he FINISHED. Two honest numbers answering different
  questions, and the pill doesn't say which it's answering.
- **The design tension:** "60%" claims a tempo he has never played clean —
  reads as inflation to the player. Counterpoint: it matches the banked-climb
  end-of-session message and tells you where you resume. If the pill switches
  to achieved-tempo, the banked chip copy ("banked your climb at 60") should
  probably switch too, or the two will contradict each other in the other
  direction.
- **Coach relevance:** the D41 ICU rule and any future %-gates (D18) read the
  same banked number — if we redefine what the trail's "current tempo" means,
  every rule that consumes it must be re-checked against which number it wants.
- **Status:** Ralph leans "show 55" (achieved). HIS call, not built —
  adjudicate after the session alongside D18.

**F20 — ⚠️ BUG: re-entering the ladder discards a banked tempo that sits
BELOW the configured start. Click-is-the-truth banks honestly; the resume
prefill throws it away.**
- **What Ralph hit:** came back to the passage via his practice note, expecting
  to pick up around his banked climb (55, per the log) — the setup's Start box
  said 70 and the session really started at 70. Confirmed on-device.
- **Mechanism (exact):** the setup prefill "resumes from the highest tempo you
  climbed to" via `Math.max(start_tempo, current_tempo)`
  (useTempoLadderSession, step-mode resume branch). That assumption — current
  can only be ABOVE start — predates click-is-the-truth. Once the dial can
  honestly bank a tempo BELOW the configured start (70 → dialed to 50, climbed
  to 55), Math.max(70, 55) silently resurrects 70. Compounding it: pressing
  Start then calls updateTempoLadderState(exerciseId, start, 0), OVERWRITING
  the banked 55 with 70 — the honest record from the last session is now gone
  from the progress row.
- **Why it matters for the coach:** the banked tempo is the trail's core
  number (pill %, banked-climb chip, D41 ICU rule). This bug means a
  dial-down session's truth survives only until the next visit — the trail
  self-corrupts on exactly the struggling-player path the coach most needs to
  see.
- **Candidate fix (post-session, Ralph approves):** when current_tempo <
  start_tempo, resume AT current_tempo (drop the Math.max floor), and
  consider having a mid-session dial-down also lower the stored start_tempo
  so the config stops disagreeing with reality. Also decide whether the log's
  session-note copy should say "banked at N" using the same number the resume
  will actually use — one vocabulary across log/pill/setup (braids with D44).
- **Unresolved sub-question:** whether the row banked 55 or 60 before being
  clobbered (log said "finished at 55"; pill said 60%; iPad data is local so
  unverifiable now). Doesn't change the bug; matters for the D44 wording.
- **CONFIRMED LIVE + WORSE (same sitting, Ralph's pin):** he started the
  70-prefilled session and exited WITHOUT a single rep — no practice-log
  entry (correct; endSession gates on completedSets>0) — yet the score-page
  pill AND the strategy-card pill both now read 70%. So the overwrite fires
  at session START (startSession → updateTempoLadderState(exerciseId, start,
  0)), and an untouched exit never rolls it back. Zero practice moved the
  trail from 55 to 70. Both pills read the same progress row, so they agree
  with each other and disagree with the log.
- **Ralph's stated principle (worth adopting as a coach-data rule):** "the
  practice log doesn't show it, so it shouldn't have updated the pill" — the
  TRAIL MAY ONLY MOVE WHEN LOGGED PRACTICE HAPPENED. Fix shape: defer the
  start-tempo persist until the first rep is played (or restore the prior
  current_tempo on untouched exit — the hadDurableRowRef cleanup path already
  knows the session was untouched).

**D45 — Rest palette on a sextuplet passage: the right mechanism exists,
invisibly (the D43 pattern again — this session's theme is discoverability,
not missing features).**
- **What Ralph hit (m45 play-test of the rest-entry ship):** entering a
  running-sextuplet passage in the Exercise Builder, he assumed tapping the
  8th-rest key would count as ONE entity, and didn't know what a 16th rest
  would do. His stated mental model: "the rest should represent a certain
  number of the rhythmic units we are working with" — in sextuplets, an 8th
  rest = 3 missing notes, a 16th rest = 1.
- **What's actually built (rest-entry ship, 2026-08-13):** exactly that. The
  palette has straight mode (running 16ths: 16th=1 / 8th=2 / quarter=4 slots)
  and a triplet toggle (slot = triplet 16th: 16th=1 / 8th=3 / quarter=6),
  plus a · dot modifier that disables buttons whose dotted value can't land
  on the slot grid. In triplet mode his sextuplet case is already correct.
- **The finding:** the BUILDER assumed his own feature lacked the semantics
  it has. Nothing on the palette says a rest key inserts N placeholders, or
  that a mode toggle changes N. A student in the wrong mode gets silently
  wrong counts (8th = 2 where the passage needs 3) with no feedback.
- **Design directions floated (Ralph to pick after the session):**
  (a) INFER the mode from the exercise's grouping the user already chose —
  grouping 6/3 → triplet slots, 4/2 → straight; demote or remove the manual
  toggle (the app already knows the running unit; asking again is a quiz).
  (b) Make the insertion visible: per-key sublabel ("= 3 notes") and/or a
  post-tap flash ("filled 3 of 6"), so the slot math teaches itself.
  (c) His literal mental model as UI: keys labeled in units ("1 / 2 / 3
  notes' worth") rendering the correct glyph per mode — trades familiar
  notation vocabulary for explicitness.
- **Status:** logged only; no fix built mid-session. Braids with D43/F20 as
  the session's emerging pattern: mechanisms outrunning their visibility.
- **RESOLVED IN DISCUSSION (same sitting) — direction (a) inference is DEAD,
  killed by Ralph with a correct counterexample:** grouping is pattern
  length, not note value (running 8ths with grouping 4; sextuplets with
  grouping 3). The running unit lives on a photo the app can't read — the
  information isn't there to infer. **LEADING CANDIDATE (Ralph: "might be a
  very elegant solution", wants to SEE it in practice before committing):
  replace the entire rest palette with a single SKIP key.** One tap inserts
  one placeholder — the same interaction grammar as note entry (one tap =
  one slot). The user counts missing notes in their OWN passage's terms; the
  app never claims what an "8th rest" means. Collapses three glyph buttons +
  straight/triplet modes + the · dot modifier into one un-misunderstandable
  key. Known trade-off (his open question): long rests = many taps (quarter
  rest in sextuplets = 6); hold-to-repeat is the escape hatch if real
  repertoire demands it. Build as a post-session trial for him to play with
  — not a committed replacement until he's used it.

**D46 — Ralph's ruling on the miss-triggered tempo-drop (adjudicates D14's
threshold and upgrades D43's whisper into an action).**
- **Context he gave first:** today's 70-unplayable situation arose from the
  broken handoff — a correctly-clocked passage wouldn't normally start that
  high. So he HESITATES to have the coach step in ("I hesitate to have the
  coach step in and say try it slower") — but concedes "there will be people
  who do that." The intervention is for THEM, not for his own workflow.
- **His spec (near-verbatim):** if the user hits Miss THREE times before
  finishing a sequence without a mistake, the coach pops up: "The purpose of
  this exercise is to play the passage without a mistake. Perhaps you should
  try it slower?" with tempo-drop buttons (−5 / −10 / −15 / −20 BPM, or
  similar) plus a Dismiss so the user can say no.
- **Why the machinery is nearly free:** the drop buttons just set the
  metronome — click-is-the-truth already makes the ladder follow, credit
  cleans at the new tempo, and bank honestly. The modal is the only new
  build. This supersedes D43's copy-only "surface the dial" idea; the modal
  could still mention the dial exists (teaches the affordance for next
  time).
- **Details RESOLVED by Ralph (same sitting):** (1) Dismiss is final — the
  coach does not ask again that session. (2) Step mode ONLY, even though
  cluster/custom also capture misses (neither has a single rung to slow
  down, and custom's strict miss-restart is already its own pressure).
  (3) Copy LOCKED: Ralph approved the voice-rules rewrite. Final wording:
  "This one's about clean runs. Want to drop the tempo and nail it?"
  ⚠️ HIS STYLE RULE, remember it for all coach copy: avoid em dashes so the
  text doesn't read as AI-written.
- **Miss-capture inventory (established same sitting):** only Tempo Ladder
  (all modes) and Rep Rotator consistency mode capture clean/miss. ICU
  (NEXT/BACK only), chaining tools, and rhythm tools are blind; the
  evaluation probe is a one-shot measurement, not a stream.
- **OPEN THREAD spun off (not designed):** a LIVE mid-session intervention
  for Rep Rotator would need a different remedy than "slower" (spots have no
  rung). Honest shape: "this spot isn't ready for rotation, want to rebuild
  it with Micro-chaining?" The existing July grind rule already covers this
  post-hoc at the next coach visit. Park until D46 proves itself in the
  ladder.
- **Resolves D14's "~4, TBD" threshold to 3-misses-before-first-clean-at-
  the-rung. Status: agreed direction, post-session build.**

**D47 — Rep Rotator: the failing passage takes over the rotation. Ralph's
design: drop it from the lap, rescue it at the end.**
- **His observation (confirmed in code):** rotate five passages, four
  complete their reps and DROP OUT of the lap (only uncompleted spots
  rotate; missed spots are front-loaded, useInterleavedSession). The
  rotation shrinks until the one passage you can't play is soloing. "If I
  can't play it, I can't play it" and the rotator's whole premise
  (interference between passages) has silently vanished by then.
- **His spec:** after 3 misses on a spot with no clean run, gentle nudge:
  "Maybe this passage isn't quite ready for the rep rotator yet." Offer to
  DROP that passage from the rotation. The rotation continues with the
  rest. At the END of the session, offer to drop into the removed passage
  with a more focused session, with a button that takes them right there.
- **The remedy tools (his student answer, verbatim intent):** "you need to
  go back and do some interleaved click-up and tempo ladder interspersed."
  NOT micro-chaining. This supersedes the July repGrind→micro-chaining rule
  (06802fc) for this signal; see D48 for why.
- **Coach-copy style rules apply (gentle, no em dashes). Status: agreed
  direction, post-session build, after D46 proves the pattern in the
  ladder.**

**D48 — ⚠️ PRODUCT LEANING (not decided): chaining strategies are on the
chopping block.**
- **Ralph, unprompted, "if I'm being completely honest":** he NEVER uses
  micro- or macro-chaining and finds them unhelpful; he is heading toward
  hiding both or removing them altogether. This is his own prejudice, his
  word, but it is also his pedagogy, and the app's coach speaks with his
  voice.
- **Live usage data (prod, read-only, 2026-08-14):** micro 51 sessions / 16
  distinct users; macro 36 / 11. Versus ladder 576/22, ICU 272/30,
  interleaved 582/14. Roughly 3 sessions per user who tried chaining =
  sampled, not adopted. But 16 real users have history there, so removal
  isn't free; hide-for-new / keep-for-history is the gentler shape.
- **Blast radius if hidden/removed:** the July repGrind→micro rule, the
  "floor" rule (stuck → drop back to Macro-chaining, Session-June H), coach
  routing + reminder action buttons that reference chaining, and the
  strategy list on passage detail. Every one needs a re-route decision
  before any hiding ships.
- **Status: leaning logged, NO decision. Needs a dedicated non-practice
  session with the usage data on screen.**

**F21 — Exiting the Exercise Builder before saving still leaves a created
exercise behind.**
- **What Ralph hit (his pin):** create a rhythm exercise → exit before
  saving → an exercise exists anyway.
- **Mechanism:** the exercise row is minted the moment the name prompt is
  submitted on the rhythm-list screen (insertExercise(id, 'rhythmic', name,
  '{}')) — BEFORE the builder even opens — because the builder needs a row id
  to autosave config into (debounced updateExerciseConfig on every edit).
  There is no explicit "save" act at all: creation happens at naming, content
  saves continuously. So "exit before saving" leaves an empty named shell in
  the rhythm list.
- **Fix shape (post-session):** the Tempo Ladder already solved this exact
  problem — its untouched-session cleanup deletes the progress row on exit
  when nothing was practiced (hadDurableRowRef). Builder equivalent: on
  unmount, if the exercise has zero pitches AND was created this visit,
  delete it (softDeleteExercise). Deferring creation until the first note is
  the purer fix but restructures the autosave; the sweep is the cheap one.
- **Status:** logged only; Ralph picks the fix shape after the session.

═══════════════════════════════════════════════════════════════════════

# SESSION 4 (2026-08-13 evening) — FIRST LIVE USE of the evaluation flow +
# coach card (shipped same evening, commit 46a59df). Ralph's raw reactions,
# recorded at his request before his usage window closed. NO fixes built yet.

**✅ What landed well:** section-sibling tempo inheritance ("that was cool" —
his own design from this morning's pushback, verified working in real use) and
the overall pace — "it just gets me practicing pretty quickly."

**D38 — Post-session chip overload: six options, no basis to choose.** Right
after his first evaluation→ladder session, the practice-journal prompt offered
~six chips and, playing a "beginner," he had no way to know which to pick.
The chip spec was written for an expert who already has a next-time intent;
a first-timer has none — the coach is helpful during the session and then
abandons them at the exact moment it should keep carrying. Candidate
directions (not decided): fewer chips early (just "Do this again next time" +
Skip for a passage's first sessions), or the coach pre-sorts/highlights ONE
suggested chip (the mock-up's "pre-sort best guess first" question, now with
evidence), or the card explains what choosing does. HIS call.

**D39 — Is the probe-at-goal step even useful for a normal user?** His doubt,
verbatim in spirit: most users can't play it at tempo — if they could, they
wouldn't be practicing it — so the probe may be a guaranteed-failure step.
Tension to adjudicate against his OWN D6 (the probe was his expert first move:
triage + feel the gap). Possible resolutions when he has budget: keep the probe
but reframe its copy as reconnaissance ("see how far away it is" — expect to
miss; a miss IS the measurement), make it skippable, or drop it for passages
that inherit a goal. NOT changed yet — his pedagogy call.

**D40 — ⚠️ The clean-tempo hunt biases LOW, and low is the dangerous
direction.** The hunt preloaded 60 (half of goal — his own 50% call this
morning), he could ✓ it easily — but he might have cleanly played 80, and
nothing asked. A too-low "clean" tempo silently drags the whole handoff down
(ladder start = clean − buffer). His asymmetry argument: too-high self-corrects
("can't play it → slow down") but too-easy just gets a polite ✓. The step never
communicated that the goal is the SWEET SPOT — the highest tempo that's clean
and comfortable. Cheapest fix candidates: copy change ("nudge UP until it
stops feeling easy, then back off one notch — we want your highest comfortable
tempo") and/or an explicit "that was easy — try faster" response next to ✓/✗.
Feels like the most build-ready of the three; still awaiting his word.

**D39/D40 — RESOLVED by Ralph (same evening), both as COPY fixes, BUILT:**
probe heading is now "Let's just make sure you can't already play it at
tempo" (his wording — reframes the probe as reconnaissance, a miss is the
expected outcome); find-step instruction is now "Nudge the tempo up until it
stops feeling easy, then back off one notch — that's your clean tempo."
Note: the ladder handoff still subtracts the ~12% comfort buffer BELOW that
backed-off tempo — this matches his own Frenzy behavior (clean 80 → start
70), so it is not double-discounting. D38 (chip overload) remains OPEN.

**D38 — RESOLVED and BUILT (same night, Ralph picked "coach proposes one
note" from five UI options).** The end-of-session prompt now leads with ONE
pre-picked chip + a session-grounded observation: "🎯 For next time, the
coach suggests / [Keep climbing the tempo] / You banked your climb at 60,
heading for 120." → Sounds right (one tap: note + one-shot reminder + save)
· Something else… (unfolds the full chips + text box, unchanged) · Skip.
Rules per session outcome (lib/practice/noteChips.ts proposeNote): ladder
reached goal → "Introduce some variation"; grind (misses ≥ 2× target) →
"Start slower next time"; else → "Keep climbing" with the banked numbers;
ICU/RV/others → "Do this again next time"; Rep Rotator → no proposal (no
chips by design). Edit flows keep the classic UI. The proposal is always an
existing CHIP string so resurfaced-reminder action buttons work untouched.
**SIM-VERIFIED end-to-end on an iPad simulator (Claude drove it): marked a
passage → full 5-clean ladder set → End session → proposal stage rendered
with real numbers, no keyboard → Something else… unfolded the classic six
chips → chip + Save & finish → landed on the page → ‹ Library reached the
library (F18 re-verified on the exact reported path).** Not yet verified on
Ralph's physical iPad.

**D41 — First live calibration of the suggestion card: too ladder-loyal.**
Exploring "How should I practice?" across his practiced Adams passages, the
card proposed "pick the Tempo Ladder back up" WITHOUT EXCEPTION — while his
own read is "I've done enough tempo ladder to feel like I've practiced the
notes; ICU would be way more powerful now." Why the code did that: the ICU
rule only fires on 2+ ladder sessions with ZERO ICU ever; any other trail
falls through to "continue your last tool," which parrots the ladder
forever. This is his D18 %-threshold voting itself back in: once the ladder
has the passage banked around ~65–70% of goal, the suggestion should flip to
Interleaved Click-Up ("cement it") even on mixed trails. PROPOSED RULE
(awaiting his word, not built): last tool = ladder AND banked ≥ ~2/3 of goal
→ suggest ICU regardless of prior ICU count; wording varies ("come back to
ICU" when he's used it before). Braids with the open D18×D27 adjudication.
**RESOLVED by Ralph (same night): TIME-based, not %-based — "the coach
should suggest ICU after 2 days of tempo ladder." BUILT: ladder sessions on
≥2 distinct calendar days + ladder was the last tool → ICU card; prior ICU
use only changes the wording ("come back to ICU"). Days, not sessions —
multiple stints in one evening are still day one. Note the %-gate (D18) and
long-passage exception (D27) remain unadjudicated; this rule supersedes the
old 2-sessions-and-never-ICU'd rule.**

**F18 — ⚠️ BUG (fixed same evening): after a logged session, PDF → "‹
Library" dropped him back into the Tempo Ladder.** The land-on-the-page
feature (eb6a58f, D33) used router.navigate, which PUSHES the document on
top of the tool when the document isn't already in the nav stack — so the
score's back/exit found the finished ladder underneath. Fixed in
returnToScoreAfterSession with router.dismissTo (pops to the existing
document, or REPLACES the tool screen when absent) — one helper, all ten
tools inherit the fix. Needs a live check: finish a logged session from a
PDF passage → land on the page → "‹ Library" should reach the library.

═══════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════

# 2026-08-12 — ⚠️ F17: TOTAL LOSS OF THE FRENZY DATA (accidental wipe)

Returning from vacation, Ralph tapped "Download my web library" with the
wipe-local-data option before practicing. Frenzy existed ONLY on the iPad
(no native→web sync), so ALL of it is gone: document, 9+ passages, sections,
ladder progress, and every practice-log entry from sessions 1–2. Confirmed.

**Product finding — the most serious of the whole log:** a settings-adjacent
button destroyed weeks of local-only work, and it caught THE BUILDER. No
warning proportional to the loss. Required fix (spun off): before any wipe,
count what exists only on this device and say it plainly ("This will
permanently delete N passages and M practice sessions that exist nowhere
else"), with heavy friction. Root fix: native→web sync
(project_ios_storage_rearchitecture), urgency raised hard.

**What survives:** the scanned PDF (Genius Scan/Files), every design finding
in this log, and the cheat sheet to rebuild the markup (~15 min): section
stamp ♩=116 top of page 1 · boxes: m20-21 (merged), 22, 24, 25, 26, 27 +
page-2 passages (one long/hard) · ladder 70→116, +5, 5 clean · hard page-2
passage starts 65 · last known positions: 20-21 ≈ 85 BPM (73%), hard passage
clean at 60-65, ICU reached tempo contact on both.
**Silver lining:** a rebuild + re-probe by an out-of-shape player against
KNOWN prior numbers (85) is accidentally a clean vacation-decay measurement —
whatever clean tempo he re-finds vs. the old ledger = the dormancy discount,
quantified.

═══════════════════════════════════════════════════════════════════════

## SESSION 3 SUMMARY (closed — Ralph to family time; mock-up session planned tonight)

**Practice:** full recovery from the F17 wipe (rebuild ~15 min via this log),
worked page 1 → measure 45 territory of Frenzy.
**Headline findings:** D31 blind blocked-vs-interleaved retention result (ICU
passages came back from vacation cold at tempo; ladder-only passage able but
uneasy) · D29 dormancy ≈ zero decay on trained passages (my 10–15 BPM guess
wrong twice) · D32 the mirror-coach design + Ralph's voice-spec draft ·
D34 texture tags (the human is the OMR) · D37/a/b rest-handling fork,
resolved then deliberately reopened · D35 when-to-use card blurbs BUILT
(unshipped) + the Macro-Chaining "I don't know" tell · D33 post-session
landing spot / D36 label collisions → fix pile.
**TONIGHT'S MOCK-UP DOCKET (Ralph's ask):** 1) evaluation flow + one-button
practice hub (the July design, now evidence-backed by D33's hub-as-toll-booth)
· 2) margin-tab page labels (D36) · 3) actionable notes + insight card
(D30/D32, his draft copy) · 4) m45 rest-semantics prototype, both forks
(D37) · 5) small-fix batch review (landing spot, label collision nudge, card
blurbs ship).
**Unshipped code:** strategy-card blurbs (tsc clean). Wipe-guard session
still running in background. App Store / IAP project parked as its own
session (Small Business Program enrollment = Ralph's human task, START IT).

# SESSION 3 (2026-08-12) — the return: rebuild + vacation-decay measurement
Conditions: ~2.5 weeks off (vacation, no playing), instruments freshly
serviced (feel different). ⚠️ Tag all session-3 rules "atypical conditions."

**D29 — dormancy probe, take one (CORRECTED).** Rebuilt Measure 20-21, played
at 70: clean ×5 and "extremely easy." ⚠️ RETRACTED my first inference — he
started at 70 because MY rebuild cheat sheet said 70, not by instinct
(experimenter contamination; Ralph caught it). "Extremely easy at 70" says
decay may be much SMALLER than the 10–15 BPM I guessed. Real measurement in
progress at his suggestion: direct probe at 85 (the pre-vacation clean).
**RESULT: full set of five at 80 — one miss, "got through it just fine."**
80 was the honestly-proven pre-vacation clean. So ~2.5 weeks fully off cost
essentially NOTHING in tempo on this passage — slight roughness (1 miss in 5)
at most. My 10–15 BPM decay guess: wrong twice in one hour. Coach
implication (1 data point, atypical-conditions tag): dormant ≠ decayed — the
banked resume point may be MORE trustworthy after a gap than intuition
suggests, at least for passages that got real interleaved work before the
break. Whether that's consolidation-during-rest is Ralph's domain to call.
**D29 take three (Ralph's own design):** he flagged his OWN confound — 20-21
got warm-up reps at 70 before the 80 set. Cleaner probe now: a rebuilt
passage with ZERO practice today, cold, straight at 85. He's caught two
experimental contaminations in a row (mine, then his). In progress.
**RESULT: COLD, 85 BPM, FIVE IN A ROW, NO PROBLEM.** After ~2.5 weeks fully
off. Ralph's own read (his pedagogy, logged as his claim): "Given that we did
some interleaved click-up, I'm starting to not be surprised at how well the
technique will survive pressure and lapses. It's truly impressive." →
Candidate coach rule: ICU-trained passages carry a dormancy discount of ~ZERO
— trust the ledger, verify with one rep. NATURAL NEXT PROBE (proposed):
measures 24–27 got LADDER-ONLY work (never ICU'd) before the same vacation —
cold-probe one of those at its old clean tempo. Same gap, different training
history = the blocked-vs-interleaved retention comparison, in vivo.

**D29/F17 coda — the wipe's real cost, in Ralph's words:** his starts today
are faster than the originals "because I've already done practicing. That is
not captured in the app at this moment because I erased everything." The
inherited-start surprise (above) was largely the blank ledger's fault, not
the feature's — the app's suggestions are only as good as its memory, and
its memory was erased. Self-healing: each re-laddered passage rebuilds its
row at his TRUE current level, so the distortion fades within a session or
two. Keep full-config inheritance as-is pending post-recovery votes.

**D31 — BLOCKED vs INTERLEAVED RETENTION, MEASURED BLIND. The headline finding
of session 3.** Ralph worked down to measure 24 and probed it at 85 WITHOUT
having read my suggestion to use 24 as the control (he read it afterward) — a
genuinely blind probe, no expectation bias. Result: playable at 85, but
"significantly less comfortable" than the ICU-trained passages, which came
back cold and effortless. Same vacation, same piece, same player: interleaved
training survived the gap with comfort intact; blocked-only training kept the
ability but lost the ease. His reaction: "just fascinating."
- **Caveats (honest):** N=1 per condition; comfort is subjective; measures
  differ in content (difficulty not controlled, though all page-1 measures
  played similarly on day 1); atypical-conditions tag applies.
- **Coach rule this seeds (fully codable TODAY):** the practice log already
  records WHICH strategy each session used per passage — so the trail knows
  each passage's training history. Dormancy re-entry can be per-passage:
  ICU-trained → trust the ledger, one verify rep; blocked-only → softer
  re-entry (drop toward start). More deeply: after N blocked sessions the
  coach should PUSH interleaving — not for faster learning, but for what
  survives. This is the app's core pedagogy proven on its owner's hands.

**D32 — Ralph's ask: the coach as a MIRROR — surface the user's own learning
patterns.** Prompted by D31: can the coach do for users what the scribe did
for him — notice (via missed takes on return, etc.) that comfort/retention
differs by training history, and surface the realization so users "understand
better how they learn"?
- **Detectable with existing data:** per-passage strategy history + gap
  lengths + first-session-back miss rates and tempo vs the pre-gap ledger.
  Rule: after a gap, compare re-entry quality across passages with different
  training mixes; when the split is clear, surface it. Comfort itself is
  invisible (D9) but return-miss-rate is his own proposed proxy.
- **Design principles:** (1) Insights are RARE and earned — an insight engine
  that chats becomes the tutorial problem we just killed. (2) Delivery via the
  quiet-dot bell pattern he praised today — never a popup. (3) Always show the
  user THEIR numbers ("after 3 weeks off: Click-Up passages came back at
  full tempo; ladder-only ones missed 3× more") and phrase as observation,
  letting the musician judge the interpretation — same contract the scribe
  uses with Ralph. (4) Deterministic pattern rules + template copy; no LLM
  needed for v1, consistent with coaching-mode philosophy.
- Converges with the transparent-history-first direction in
  [[project_pfn_spacing_audition_mode]]. Metacognition as product: the app
  doesn't just direct practice, it teaches the player how THEY learn.

**D32a — Ralph's own draft of the insight moment (voice spec — use his words):**
Timing: fires right after tapping Log at session end (the flow is already
paused there — acceptable modal moment, unlike mid-play popups). Draft copy,
lightly normalized: *"You may not use the app every day you're practicing,
but it's been X days since you opened this app — that suggests maybe a
vacation or an illness. I noticed measures 20-21 and 22 seemed more
comfortable than measure 24 at this tempo. It could be that the passage is
legitimately more difficult — or it could be that the first two were
practiced with ICU and the third one wasn't. Just food for thought."*
Key properties his draft nails: hedged gap inference (he KNOWS the trail is
partial — users practice off-app; see the Beth caveat), two candidate
explanations offered honestly, zero directive, "food for thought" sign-off.
Refinement to carry: ride the EXISTING post-log surface (one card in the
summary/note flow) rather than stacking a new modal; once per gap-return,
never routine.

**D33 — Post-session landing spot: the hub is a detour.** Finishing a session
returns to the PASSAGE view (strategy hub); Ralph wants the PAGE (document
viewer) — his working loop is page-driven: box → practice → next box on the
page (consistent with D1 folders, session-1 "bottom of the page = natural
stopping point"). He hedged ("don't know whether that would make sense") —
so: candidate, not committed. Design principle: return to WHERE YOU LAUNCHED
FROM, skipping the hub (doc → hub → tool → [end] → doc). Technically the hub
sits in the nav stack so back() lands there; fix = dismiss past it when the
passage came from a document. **Deeper signal: this is more evidence for the
structure rethink** — in the one-button design the hub disappears entirely
and this friction evaporates. The hub keeps showing up as overhead in the
real working loop.

**D34 — "The app can't read the music" — the texture problem, and two ways
around it.** At measure 45 (running 16ths), post-ladder, Ralph's instinct
said rhythmic variation — and he concluded the coach could never know that
since it can't read notation. Two honest counters:
1. **The human is the OMR (recommended).** One optional tap when a passage is
   first practiced — "What kind of passage is this? Runs / Rhythm / Lyrical /
   Leaps" — harvested at the same cheap moment as the rest of the evaluation.
   Ralph is already looking at the music; the app just files his glance.
   Rule it unlocks: runs + laddered plateau → suggest Rhythmic Variation
   (his exact decision today, codable from one tag).
2. **Light vision classification (someday, flagged).** Full music-reading is
   a research project, but "is this mostly continuous fast runs?" is texture
   CLASSIFICATION on an image the app already has — feasible with modern
   models. ⚠️ Breaks the deliberate no-AI/deterministic coach philosophy
   ([[project_coaching_mode]]) and adds cost; park unless tags prove too
   much friction.
Division of labor stays the established one: musical judgment is HUMAN input,
harvested at cheap moments (boxes D4, units D19, tempo stamps D3, now
texture tags); the coach's job is remembering and operationalizing it.

**D35 — Strategy cards rewritten from what-it-does to WHEN-YOU'D-REACH-FOR-IT
(Ralph's dictated copy, BUILT same-session).** New blurbs: Tempo Ladder +
ICU = "works on everything" (ICU: "maybe the most effective way to make a
passage solid"); Rhythmic Variation = running 16ths/sextuplets; Micro = first
meetings or one hard spot; Rep Rotator = spaced sets approaching a
performance/audition. Guidance-into-furniture: the coach's when-question,
answered statically on the cards. Card blurbs get 2 lines everywhere now.
- **⚠️ The Macro-Chaining tell:** asked when you'd use it, its own author
  said "works on anything… I don't know." Claude drafted a placeholder
  ("Join chunks you can already play into one seamless run") pending Ralph's
  rewrite — but a card whose creator can't state its purpose is a prime
  demote-to-More-fold candidate in the structure rethink (it's also the
  least-used live tool: 8 users ever).
- tsc clean; UNSHIPPED — rides the next batch. Ralph should eyeball wrapping
  on the iPad cards + landscape rows after ship.

**D36 — Overlapping boxes make labels unreadable (page 1: 4 boxes, 3 overlap,
2 hide the completion %).** Root cause is honest: line-wrapped passages must
box whole lines, so neighbor boxes legitimately share rows — fix the LABELS,
not the boxes. Two tiers: (a) NEXT BATCH: collision-aware pill placement
(shift a colliding pill to below-top-edge / other corner, map-label style;
no movement when no collision); (b) MOCK-UP: margin tabs — name+% live in
the page gutter at the box's height, stacked collision-free like rehearsal
marks; tap a tab to light its box; score stays clean. (b) changes page feel
→ clickable mock-up first.

**D37 — Exercise Builder: rests + off-beat starts (m45 case: an 8th rest
before running 16ths — currently unenterable).** Ralph's instinct: a 16th
REST as a token "treated just the same as a 16th note." Design fork he
correctly couldn't resolve in the abstract — two semantics:
(a) REST-AS-NOTE: patterns transform rests too → downstream notes shift
against the beat per variation = displacement training (potent, radical,
breaks metronome-grid alignment);
(b) REST-AS-GRID-HOLE: rests are fixed silences, patterns transform only the
notes in place → off-beat starts + embedded rests work, metronome sync
survives (probably the wanted v1).
**Agreed path: prototype BOTH on his actual m45 passage** (notation side by
side, machinery exists — abcjs + preview script), he plays them and picks.
One-evening prototype, next design session, before any builder surgery.
**D37a — RESOLVED by Ralph's real-world technique (better than both forks):
patterns anchor to the METER, notes ride them; enter mid-pattern at a clean
seam.** With an 8th-rest pickup he picks variations divisible per eighth
(2/4 patterns yes — seam at every eighth; 3/8 patterns no — no seam at his
entry) and starts on the pattern's second half. Feature spec this yields:
(1) passage stores its start OFFSET within the beat; (2) patterns apply
against the beat grid, notes inherit the slice at their grid position —
leading rests just consume the pattern's front; (3) the pattern picker
FILTERS to patterns with a seam at the entry offset (his 2/4-vs-3/8
judgment as a divisibility check on the library). Prototype should build
THIS; keep rest-as-transformed-token only as a cheap curiosity comparison.
**D37b — REOPENED by Ralph himself:** his seam rule may be a HUMAN-LIMITATION
workaround, not optimal pedagogy — "I don't have the ability to transform the
rhythm without that super simple rule, but I bet if I could, it would be even
more helpful." Precedent in his own app: Custom ladder exists because you
can't surprise yourself — the machine doing what self-practice can't IS the
product. Rest-as-token generates displacement variations no human can
self-administer (and renders them as legible notation, removing the cognitive
load that forced the simple rule). Honest label: untested pedagogy — possibly
by anyone, since pre-machine nobody could practice this way. → Prototype
BOTH as equals on m45; his fingers vote at the stand. If (a) works it's a
teacher-toolbox-exceeding differentiator; if not, we learn why the seam rule
was right.

**D30 — The note that surfaced but couldn't act.** His session-2 remindNext
note ("Introduce some variation") correctly greeted him on reopening the
passage — the loop WORKS — but "there's no indication of how to do that."
His ask: the note should offer options. His three variation paths: (1) Tempo
Ladder randomized cluster, (2) ICU, (3) Rhythmic Variation.
**Design candidate (closes a beautiful loop):** chip-created notes are KNOWN
STRINGS — the app can recognize "Introduce some variation" and render action
buttons under the reminder that deep-link to those three tools. Chips (F4) →
structured intent → actionable reminder = the coach's first real muscle, no
AI required. The free-text path stays display-only.

═══════════════════════════════════════════════════════════════════════

# SESSION 2 — day-two practice on Frenzy (fixes batch is LIVE on the iPad)

**The two questions this session answers:**
1. **The day-two decision** (D15/D16): refine the page-1 measures, push into new
   territory, or introduce variation (cluster/ICU) as he predicted he would?
   His FIRST move today is the highest-value datum of the whole experiment.
2. **Do the shipped fixes hold up in real use?** Watch especially: sibling
   prefill on any NEW passage's ladder, tap-outside close, step-up display,
   demoted End button, merged label pills, iPad hint copy, note chips.

## Session 2 decision log

**D18 — The switch threshold, quantified for the first time (by Ralph, live).**
- **His articulated rule:** at 50–60% completion he'd stay on Tempo Ladder; at
  ~73% (where Measure 20-21 sits today) he feels "close enough to make the
  switch to ICU." Gut instinct, now with a number attached.
- **Meta-finding:** he has NEVER thought in completion-percentage terms before —
  the app's displayed % gave him a vocabulary for a felt sense he already had,
  and the number and the feeling AGREE. The instrument panel is teaching the
  pilot. (TL% here ≈ current tempo / goal tempo: ~85/116.)
- **⚠️ Tension to adjudicate (vs D8 follow-up):** in session 1 Ralph REJECTED
  gap-size→tool mapping ("90%→100% is the same process as 50%→100%"). Today he
  proposes exactly a %-threshold for the ladder→ICU handoff. Possible
  resolution: the CLIMB process is gap-independent, but the PHASE SWITCH
  (notes→cementing) is %-gated. Needs his ruling before it becomes a rule.
- **Candidate coach rule (his to confirm):** while TL% < ~60 → keep laddering;
  once TL% ≥ ~70 → suggest switching to ICU ("time to cement it").

**D19 — ICU unit marking: musical units, not mechanical beats.**
- **What Ralph did:** chose beat-mode marking but deliberately did NOT mark
  every beat — placed markers where units "make sense to me," including one
  unit twice the length of its neighbors specifically "to make sense of the
  silence of the rest." Narrated placements in musical terms (second 16th of
  the last beat, downbeat, etc.).
- **Connects to D11:** the break inside this passage was WHY combine-vs-
  separate was hard at box-marking time. ICU units resolve it — the passage
  stays merged, units subdivide it musically. Granularity fluidity has a home.
- **Verdict: NO (and healthily so).** Unit placement is pure musical judgment —
  the app can't see rests in a photo. This is exactly the human input ICU's
  marking phase exists to harvest; its friction is earning its keep. No rule
  should try to place these.

**F10 — The invisible fencepost: you must mark a unit AFTER the passage ends.**
Ralph: the final unit needs a marker on the rest after the last note "just to
make sure there is an ending marker — something I always did wrong at the
beginning." Even the builder got this wrong when new; nothing in the UI says a
closing boundary is required.
**Confirmed by Ralph against the live screen, and the diagnosis is PERFECT
thesis material: the rule IS documented — in the first-run tutorial modal and
behind the ? — but NOT in the persistent on-screen instruction where people
actually look while marking. Guidance in the manual instead of at the point of
use. → On-screen copy fixed same-session ("Finish with one extra mark AFTER
the last note..."); rides the next batch. The auto-placed draggable end marker
remains the better long-term fix. Candidate fixes: auto-place a draggable end
marker when marking starts, or a one-line hint at marking time ("finish with
one tap after the last note to close your final unit").

**✅ Prefill verified in real use (session 2):** opening ICU on Measure 20-21,
the config came up with performance = 116 and start = 58 (half). Ralph: "exactly
right... I'll just keep it." Mechanism note for honesty: THIS instance is the
pre-existing shared-performance-tempo path (the ladder stamped 116 onto the
passage yesterday; ICU reads it) — the new sibling-inheritance path fires when a
FRESH passage opens its first ladder. Both paths now cover the re-typing pain.
Also noteworthy: the expert accepted the half-goal default start (58) without
adjusting toward his usual clean-minus-buffer (~70) — for short ICU units a low
start is apparently fine with him.

**F11 — F8's sibling: Click-Up's own hint still said "Space / Backspace" on
iPad.** The F8 fix covered Tempo Ladder + Rep Rotator; ICU has a separate
NEXT/BACK hint line that was missed. FIXED same-session (platform-aware
constant, tsc clean) — ships with the next batch. Lesson: hint copy is
scattered per-screen; the shared constants in helpCopy.ts are now the home for
all of it.

**D20 — Unit boundaries want to be editable mid-session.**
- During ICU play Ralph wished he could re-mark: he mentally merged the last
  two units ("skipped the last little phase") because practicing revealed the
  original split was wrong. No way to change units once playing starts.
- **Pattern now confirmed at every level (with D11):** granularity — of
  passages AND of units — is provisional until it's been played. Marking
  decisions only prove out under the fingers. Design: a lightweight "edit
  units" escape from the playing phase (or at least merge-with-next), without
  losing session position.

**F12 — ⚠️ CRASH on logging after the ICU session (iPad).** After the note
prompt (chips appeared correctly), "when I went to log it, the app crashed."
Exact last tap unknown; whether the practice-log entry survived unknown (iPad
is local SQLite — only Ralph can check, via the passage's Practice History).
Suspect surface: the note-prompt → submit → logPractice path on native, OR an
interaction with the same-day pencil-fix (which changed pedal/first-responder
behavior around practice screens). NEEDS: exact repro from Ralph + simulator
investigation. Top of the next fix pile, ahead of everything else.
**REPRO DETAILS (from Ralph):** tapped "Save & finish" → hard crash to the iPad
home screen with the iOS "send feedback to developer" dialog (= a real NATIVE
crash, not a JS error). **The session DID survive** — visible in the practice
log — so the write committed and the crash is in the teardown AFTER save:
modal dismissal + keyboard resignation + navigation/unmount, exactly the
first-responder territory the same-day pencil fix rewired (ICU keeps a
PedalCatcher/KeyCaptureView active, and the note prompt summons the keyboard).
TestFlight crash reports should appear in App Store Connect / Xcode Organizer.
→ Spun off to its own debug session.

**F13 (feature ask) — note-prompt chips: add "Do this again next time."** The
chips showed up and were usable, but the one he actually wanted was missing.
(Also the philosophically perfect chip: the repeat-intent is the single
commonest next-time note.) → ADDED same-session.

**✅ Tap-outside-closes-metronome verified live:** "that worked great."
**✅ F7 (demoted End button) verified live:** Ralph noticed the celebration
modal "looks different," recalled the old two-button layout accurately, and —
without connecting it to his own accidental-Done incident — said "I do
actually prefer this." Fix registered as the-app-feeling-better, not as a
patch.
**✅ What's New bell verified live:** Ralph noticed the quiet dot unprompted,
read last night's entry, called it "a really cool feature." The
entry-per-ship rule is doing its job — fixes for silent breakage reach the
user through the product itself.

**D20a — Ralph WALKS BACK the mid-session edit conclusion (honesty entry).**
"I'm not sure whether that's true or not." He adapted fine by just playing his
merged version. Don't overbuild — park mid-session unit editing until it hurts
again.

**D21 — The real marking problem: tap accuracy vs marker height.**
- Tapping the NOTES directly is accurate; placing markers a controlled height
  ABOVE the notes is imprecise horizontally. He likes controlling the height
  but wants accuracy: "some kind of offset that just works for everything."
- **Design candidate:** decouple the two axes — the tap supplies X (tap right
  on the note), the marker auto-lifts to a consistent lane above the tapped
  point (Y computed, optionally draggable afterward for height). The passage
  crop geometry is known, so a lane above the staff is computable. Feasible;
  medium-size change to the marking components (ScoreWithMarkers /
  SectionMarkerCapturer family).

**F12 update — crash is DETERMINISTIC: 2 for 2.** Second passage, same ICU →
Save & finish → same hard crash. Reliable repro = very findable bug.
**F12 narrowing (3 crashes + 1 clean run):** SKIP does NOT crash; Save & finish
does. The delta = the annotation payload into endSession/logPractice, and/or
tearing down a keyboard that was typed into. Repro matrix sent to the debug
session (Skip/Save × typed/untyped).
**F12 re-reframe:** next Save (note + remindNext ticked) did NOT crash — on the
SAME build (verified: no new OTA published). Tally: Save 3-of-4 crash, Skip
0-of-1. Not deterministic → almost certainly a TIMING RACE in post-save
teardown. Debug session told to repro repeatedly, not once. (remindNext
checkbox path also confirmed working.)

**F14 — ⚠️ Pencil save is BROKEN on iPad (regression alongside the palette
fix), WITH DATA LOSS.** The palette now stays up (F5 fix works that far) and
Ralph could pick WHITE ink and mark the score — his own D12 white-out plan in
action. But "could not save your annotation" errors fired REPEATEDLY, starting
BEFORE he touched anything, while his strokes were visibly on screen; on
closing the pencil, the save failed for real and ALL his markings disappeared.
So commit 1ed8322 fixed palette visibility but the save path now hard-fails.
Almost certainly the same first-responder/teardown surgery behind the F12
crash — both regressions forwarded to the running debug session. **Until
fixed: pencil annotations on iPad are a data-loss risk — don't invest real
markings.**

**D22 — Passage two at performance tempo: "not comfortable, but that's okay —
I know that's okay." (F12 crash now 3 for 3.)**
- ICU walked him up to full performance tempo on day two — a materially
  different endpoint from yesterday's ladder plateau at ~69%. The felt
  difference was significant enough that he DELIBERATELY logged it, knowing
  the save would crash the app (it did — third confirmed).
- **Two signals:** (a) the subjective quality judgment ("uncomfortable at
  tempo, and that's expected right now") is exactly the D9 category — data the
  trail can't hold unless the NOTE carries it; his instinct was to write it
  down. The note field is the quality channel. (b) He paid a known crash-tax
  to preserve a practice note — strong revealed preference for the log's value.
  The practice log is not overhead to him; it's part of practicing.

**D23 — The inverse of the merge: practicing HALF a passage.**
- **What Ralph did:** next passage's crop (which again visually includes its
  neighbor — the line-wrap geometry from D11) contains a gap big enough that
  he'll split the WORK across two sittings: today he marks ICU units over only
  the first half, and will "label them in the practice log" to tell the
  sittings apart.
- **Pattern now complete, both directions:** yesterday the passage object was
  too SMALL for the practice unit (merge); today it's too BIG (subset). The
  passage box and the unit of practice are simply different things, and the
  musician constantly re-scopes between them.
- **Coach consequence:** the passage's progress % now conflates two half-
  passages — a future trail-reading coach would misread it. His disambiguation
  lives in free-text log labels, invisible to rules. Design directions when
  this hurts enough: ICU unit-subset as first-class session scope (store which
  units a session covered — the marks are positional, so this is capturable),
  and/or real split/merge ops (D11). Not tonight's problem; spec input.

**D17 — THE DAY-TWO DECISION (Measure 20-21): Interleaved Click-Up. D15 CONFIRMED.**
- **What Ralph did:** Consulted the coach; answered "just getting started, still
  learning it" → coach suggested plain Tempo Ladder. He HOPED it would say
  ladder-with-randomized-clusters. He CHOSE ICU: "the most effective tool I've
  ever found for learning notes... yesterday was playing the notes, now I'm
  ready to start really cementing it."
- **The two-phase model, in his own words:** phase 1 = get the notes under the
  fingers (blocked, buffered ladder — yesterday); phase 2 = CEMENT (interleaved
  interference — today). Textbook contextual-interference sequencing, arrived at
  by instinct. His D15 prediction ("cluster or ICU next time") came true on the
  first decision of day two — via ICU.
- **The coach's structural flaw, now precisely visible:** he gave the SAME
  self-report answers as yesterday ("just getting started") and got the same
  suggestion — but wanted a different tool. The differentiator between day one
  and day two is NOT in the questionnaire, it's in the TRAIL (5 blocked ladder
  stints, even plateau at 80, all logged). A questionnaire coach is memoryless;
  the history coach would have known. Sharpest single argument of the experiment
  for trail-driven suggestions.
- **Verdict: YES for the D15 rule** (blocked-stints plateau → suggest
  variation/interleave next session), with Ralph's rationale attached as the
  explainer copy a future coach should show.

**D24 — Page 2: ✅ THE NEW SIBLING-PREFILL PATH VERIFIED LIVE.** Fresh passage
(marked deliberately LONGER than yesterday's — his granularity is drifting
larger as the piece gets familiar), opened Tempo Ladder, and the start BPM was
pre-filled from "the work I did yesterday" — which is exactly what it is: the
new inheritance copies the most recent sibling ladder config (start/goal/
climb/reps) from the same document. He noticed it as a curiosity, not a
friction. The E1 fix's intended experience, working: the app remembered so he
didn't have to.

**D25 — THE STUCK STATE, FINALLY OBSERVED — and a tracking gap found with it.**
- **What happened:** the harder page-2 passage made the inherited start (70)
  too fast. Detection: TWO consecutive misses — "that's how I knew." He reached
  for the metronome dial and dropped to 60.
- **D14's rule now has a REAL threshold:** 2 consecutive misses (his session-1
  guess was ~4). At least at session start; mid-ladder tolerance may differ.
- **The prefill lesson:** inheritance can't know difficulty — only playing can.
  The correct chain is prefill → (probe) → miss-triggered correction. All three
  now observed in the wild.
- **⚠️ TRACKING GAP (code-verified):** the ladder tracks the RUNG
  (progress.current_tempo), not the metronome dial. A manual dial-down
  mid-session records cleans at the OLD tempo and the next step-up snaps the
  click from 60 to 75. Interim advice given (reconfigure start via setup).
  **The real fix is D14's intervention:** after 2 consecutive misses at a rung,
  offer "Drop to N BPM?" — which updates the RUNG, keeping engine and tracking
  in agreement. The two bugs (no mercy rule + dial/rung divergence) are one
  feature.
  **D25 completion — the corruption observed END TO END:** he dialed to 60 (no
  reconfigure), fought to 5 clean, ended. The ladder credited the cleans at 75,
  banked the unclaimed step-up, and persisted 80 as the resume point — 20 BPM
  of fiction in the exact numbers (resume tempo, completion %) he said this
  morning he's learning to trust. Code-verified answers: Step-up would have
  snapped to 80; reconfiguring start=65 + Start practicing RESETS the durable
  row (startSession writes updateTempoLadderState(start, 0)) — so his manual
  65 restart heals the ledger. Priority of the 2-miss mercy intervention:
  RAISED — it's now a data-integrity fix, not just UX kindness.

**D26 — (idea, thinking aloud) The annotation transfer list.**
- **His workflow pain:** marks made on the PDF while practicing (accidentals,
  fingerings) must be hand-transferred to the physical rental part at first
  rehearsal. His system: mark digitally in ORANGE ink, then page through
  hunting orange. Want: a generated LIST of annotations to take to the stand.
- **His own objection:** the tool can't orient itself in the music (can't read
  measures/rehearsal marks). **Counter (mine): orientation doesn't need music
  understanding —** (a) each annotation knows its PAGE + coordinates; a
  transfer list = page number + a visual SNIPPET (crop around the mark, mark
  included) that the human matches visually — his orange-hunt, pre-collected;
  (b) HIS OWN LABELS already supply musical anchors: annotations inside/near a
  passage box named "Measure 22" inherit that name; sections likewise. The
  D3/D5 parse-his-names trick strikes again. (c) His orange-ink habit IS a
  data model: a designated transfer color filters which strokes make the list
  (white-out strokes excluded).
- **Feasibility note:** native PencilKit retains actual stroke data
  (PKDrawing), so clustering marks into annotation groups is plausible; web
  stores composited PNGs — harder, bounding-box diffing. Parked as a design
  candidate; NOT started.

**F15 — Tap-outside catcher ATE A CLEAN TAP (the F3 trade-off, observed).**
With the metronome panel left open during ladder play, tapping ✓ Clean closed
the panel instead of registering the rep — the exact trade-off flagged when F3
shipped, now confirmed as real friction. Ralph's instinct: "both should happen
simultaneously." **Fix built same-session:** session controls (Clean/Miss
bottom bar + corner buttons, ladder + Rep Rotator) raised ABOVE the catcher
(zIndex 56 > 55) — tapping them registers the rep and leaves the panel open;
tapping the score still closes it. Rep integrity beats dismissal. tsc clean;
rides the next batch. (ICU is unaffected — it uses the edge-dock system,
which has no catcher.)

**D25 fix — "THE CLICK IS THE TRUTH" BUILT (same session, Ralph's explicit
spec).** In step mode during play, a manual metronome change (dial or tap)
now moves the RUNG with it: reps credit at the sounding tempo, the durable
resume point follows, the streak resets (5-in-a-row only means something at
one tempo), and the session log inherits honesty for free (it reads the rung).
Internal tempo changes (start, step-up) are not affected. Cluster/custom
excluded deliberately — no single rung to adopt there. tsc + web export
clean; NOT yet eyeballed live; rides the next batch. The 2-miss mercy PROMPT
remains future work — this fix makes the manual correction honest, the prompt
would make it effortless.

**D27 — ICU chosen for a LONG passage at LOW completion — refines D18.**
- Same hard page-2 passage, early in its ladder — yet he switched to ICU
  because "the passage was so long... I need to familiarize myself with the
  passage in smaller chunks, and ICU gives me that opportunity."
- **This complicates the D18 %-gate:** yesterday ICU = cementing tool for
  ~70%+ passages; today ICU = chunk-familiarization for a long passage at low
  %. One tool, two roles, chosen on different signals. The coach can't map
  tool from % alone — PASSAGE LENGTH is an input too (and the app HAS it: box
  geometry, region height/width vs siblings). Candidate refinement: long
  passage → ICU appropriate at ANY %; short passage → ladder until ~70%, then
  ICU. Ralph to adjudicate alongside the D18-vs-D8 tension.
- **Micro-break timer switched on unprompted, "very helpful right now"** —
  the timers earn a quiet validation tick during heavy learning work.

**D28 — Verdict on the hard passage: ICU beat the ladder, in his own felt
assessment.** "A lot more helpful than the tempo ladder work" — and it got him
to performance tempo (not comfortable, "but it was there") on a passage the
ladder had him grinding at 60-65. Second passage today where ICU produced
goal-tempo contact same-day. Coach-relevant: (a) supports D27's long-passage→
ICU rule with an outcome, not just a choice; (b) the efficacy signal was also
BEHAVIORAL — he abandoned the ladder mid-passage for ICU and stayed. Tool-
switches mid-passage may be the cheapest honest "this wasn't working" signal
the trail can collect, no questionnaire required.

**F16 (watch item) — ~50% battery drain in 1 hour of iPad practice.** Likely
the keep-screen-awake-while-clicking feature (commit fab4b1c, built Jul 21 but
first SHIPPED in last night's batch — today was its first real-length outing)
+ screen brightness + continuous audio + repeated relaunches. TEST next
session: stop the metronome, leave the iPad idle — if the screen never dims,
the ref-counted keep-awake assertion is leaking → fix pile. If it dims,
feature cost is honest; charger on the stand.

## Session 2 summary (FINAL — closed after the page-2 sitting)

**Page-2 addendum to the summary below:** D24 sibling prefill verified live on
a fresh passage · D25 stuck state observed + dial/rung corruption traced end-
to-end + "click is the truth" fix BUILT to Ralph's spec · D26 annotation
transfer-list idea parked · D27 long-passage→ICU refines the D18 %-gate ·
D28 ICU beat the ladder on the hard passage (and mid-passage tool-switches =
free efficacy signal) · F15 catcher-ate-a-Clean fixed (session controls above
the dismiss layer) · F7 + What's New bell verified by unprompted user delight.
**Batch 2 queue (built + tsc/export clean, UNSHIPPED):** ICU pedal-hint copy ·
"Do this again next time" chip · end-marker instruction line · rep-buttons-
above-catcher · click-is-the-truth. Holding for the F12 crash fix to ride
along. **Open adjudication for Ralph:** braid D8 ("gap doesn't pick the tool")
× D18 (~70% switch threshold) × D27 (length exception) into one rule.

## Session 2 summary (as first drafted mid-session)

**Practice:** ICU on three passages (20-21, next passage, and half of a third —
finished clean). Day-two arc: from yesterday's ladder plateau (~69%) to playing
at performance tempo — uncomfortable but expectedly so.

**Coach findings:**
- D15's prediction CONFIRMED on the first decision: he introduced interference
  (ICU) exactly as he said he would.
- The memoryless-questionnaire flaw nailed: same self-report answers as day
  one → same suggestion, but the right answer changed — because the
  differentiator is the TRAIL, not the interview.
- First quantified rule from his gut: ladder below ~60% completion, switch to
  ICU around ~70%. ⚠️ Awaiting his adjudication vs his session-1 "gap doesn't
  pick the tool" stance (proposed resolution: climb process is gap-independent,
  PHASE SWITCH is %-gated).
- Unit marking is musical judgment (NO-rule territory), boundaries are
  provisional in BOTH directions (merge D11, subset D23), and the note field is
  the quality channel — he paid a crash-tax to write one.

**Fixes:** verified live — prefill ✓, tap-outside ✓, chips ✓, What's New bell ✓.
Queued for next batch (built+typechecked, unshipped): ICU pedal-hint copy,
"Do this again next time" chip, end-marker instruction line.
**Bugs:** F12 Save-crash = intermittent timing race (3-of-4), debug session
running with full field data; F14 pencil save broken with DATA LOSS (don't
pencil-mark on iPad until fixed).

═══════════════════════════════════════════════════════════════════════

## Session summary (written at close)

**7 passages marked, 5+ practiced through identical stints (70→~80, +5, 5 clean),
one merge (20+21), zero stuck states observed.**

**The coach rules this session actually produced (all from observed behavior):**
1. Goal tempo lives on SECTIONS (stamped from printed markings; listen+tap and
   tempo-words as fallbacks) — passages inherit it. (D2/D2a/D3)
2. Marking stays cheap; evaluation fires on FIRST PRACTICE, not at marking. (D4)
3. First practice = PROBE AT GOAL → clean = done; not clean → find clean tempo,
   prove with one rep. (D6/D8)
4. Ladder start = clean tempo MINUS a buffer (~10–15%). (D8)
5. New sibling passage → prefill ENTIRE config from last sibling. (E1 — confirmed
   live failure of current app)
6. Repeated misses at one rung → offer to drop tempo (threshold ~4, TBD). (D14 —
   hypothesized, unobserved)
7. After consistent blocked stints plateau evenly → next session suggests
   variation/interference (cluster/ICU/rotation). (D15 — Ralph's own ask)
8. Quality dimensions (dynamics/tone) are INVISIBLE to the trail → coach whispers /
   passage tags, content not data. (D9)

**Fix pile — BATCH BUILT SAME NIGHT (2026-07-27, not yet shipped):**
✅ E1 sibling prefill (new ladder inherits last sibling's start/goal/climb/reps;
cluster/custom siblings lend goal only; passage-level performance tempo still wins)
· ✅ F3 tap-outside closes the open tool panel on iPad/desktop (tap is consumed,
matching phone) · ✅ F4 note-prompt one-tap chips (incl. "Introduce some
variation") · ✅ F6 name+percent merged into one top-left pill · ✅ F7 End session
demoted to a quiet text button, separated from Step up tempo · ✅ F8 iPad hint
says "Foot pedal = Clean" (no Space) · ✅ F9 step-up flash fixed (modal closes
before state advances) · ✅ F1 bound-score tip added on the Add-a-full-part
screen. Verified: tsc clean + web & iOS bundles export. NOT yet eyeballed in a
running app. Remaining for later: F2 PDF export (real feature) · section tempo
stamps (D3, design-first) · merge operation (D11) · miss-triggered tempo-drop
(D14, pedagogy) · variation-suggesting coach (D15). Pencil bug (F5) fixed in its
own session (committed).

**Known blind spot:** all rules derive from EASY material. Schedule a session on
genuinely resistant material before trusting rules 3/4/6 under struggle.
- **What Ralph did:** Opened the "26-27 season" folder, created "Week 3" for that week's
  repertoire, then noted Frenzy belongs to Week 5 and planned a "Week 5" folder for it.
- **What the app could have known:** Nothing yet — but note what his STRUCTURE encodes:
  for an orchestral player the folder hierarchy (season → week) IS the deadline system.
  "Week 5" is a due date wearing a folder name.
- **Verdict: design insight rather than rule-vs-judgment.** The evaluation flow's
  "When does this need to be ready?" question may be redundant for users who organize
  this way — a folder could carry the due date (set once per folder: "Week 5 = concert
  week of Oct XX"), and every passage filed in it inherits the urgency. One tap per
  FOLDER instead of one per passage. Worth testing against non-orchestral users
  (students may have no such structure).
