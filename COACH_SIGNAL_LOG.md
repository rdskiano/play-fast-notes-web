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
