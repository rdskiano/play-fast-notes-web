# Play Fast Notes — current state

**As of 2026-08-23.** One screen, deliberately. Anything longer belongs in `CLAUDE.md` or `ROADMAP.md`.

**Why this file exists.** `CLAUDE.md` is thorough but 75 KB, so nothing outside a terminal session reads it. Cowork sessions (marketing, strategy, planning) read *this* file plus live database numbers. Between 2026-06-26 and 2026-08-16 the Cowork side had no idea the price had changed from a $39/yr subscription to a $19.99 one-time unlock, and a full marketing plan got built on the wrong number. This file is the join.

**Maintenance rule.** Update this at the end of any session that changes product state: price, platform status, what shipped, what the current workstream is. Overwrite the stale lines, do not append a log. Keep it under one screen.

---

## Product

- **Web** — live at playfastnotes.com, ships from this repo. Where all paid conversion happens today.
- **iPad / iPhone** — v1.1.0 build 14 REJECTED by Apple 2026-08-24 (guideline 2.1(b): the reviewer's sandbox purchase errored). Root cause found same day: a server-side bug in the purchase-verification function rejected EVERY purchase as "not signed in" (the check never read the caller's login token). Fix deployed 2026-08-24 PM and sandbox purchase VERIFIED end-to-end (TestFlight buy unlocked Pro on iPad AND web). Ralph replied in Resolution Center and resubmitted build 14 on 2026-08-24 — Waiting for Review. Buying on either platform unlocks both.
- **Cross-device sync** — web to iPad, including pencil marks, shipped 2026-08-15/16. "Snap the part on your phone, practice from the iPad on the stand" is now true.

## Price

- **$19.99 one-time, unlock forever.** Live since 2026-07-04. **This is not a subscription.**
- The $39/yr + $4.99/mo subscription model was retired 2026-07-03/04, before anyone ever paid for it. Do not build plans on it.
- Free tier: 3 photo passages, all practice strategies included.
- Stripe live one-time price: `price_1TpXSZC1HWgXmdPC0uihVt1z`.
- Comps: roughly 50 expired 2026-07-26, 20 expire 2026-12-26, 7 lifetime.

## Numbers (2026-08-16, test accounts excluded)

- **92 real signups.** 17 in the last 30 days. Baseline growth is 2 to 5 a week with zero deliberate marketing.
- **5 paying customers, about $100 gross.** First on 2026-07-12; two on 2026-08-10, one of whom signed up and bought the same day.
- **Funnel:** 92 signed up → 48 added their own music → 41 practiced once → 25 came back a second day → 10 practiced on 5+ days.
- **Conversion tracks habit:** 0 practice days converts at 1.9%, 5+ days at 15.4%.
- **Strategy reach** (distinct users, excluding Ralph): click-up 29, tempo ladder 21, micro-chaining 15, rhythmic 14, interleaved practicing 13. Depth is inverted: click-up gets 9 sessions per user, interleaved practicing 45.
- **Caveat that applies to every engagement number above:** `practice_log` only records sessions where the user taps Done. These are floors, not ceilings. At least one confirmed heavy user shows almost no logged activity.

## Only real traffic event so far

Noa Kageyama (The Bulletproof Musician) signed up personally on 2026-06-07 and roughly 45 of his readers followed within four days. Still the largest thing that has ever happened to the app, and it was accidental.

## Current workstream

- **"Daily exercises" feature in DESIGN (2026-08-24, not built)**: long-horizon tempo tracking for technique work (articulation, scales, chromatic) — a commitment device: pick ONE exercise, log a locked-in tempo per day, watch the line climb. Score attached like any piece (no cropping); a learned multi-page document can graduate into one, its passages staying underneath as the repair shop; bump the metronome mid-practice, lock in a final tempo at the end; increment concept shared with Tempo Ladder. Metronome only, never a stopwatch (Ralph's call). Design conversation lives in this session's transcript.
- **Type-your-own setup pills BUILT 2026-08-24, NOT shipped**: Tempo Ladder (Climb-by + Clean-reps rows), Interleaved Click-Up (Increment), and Rep Rotator (clean reps) each gain an outlined type-any-number box (1-99) beside their presets — empty outline until the typed number is active, then filled like a selected preset. Rep Rotator streak display switches from dots to "streak/target" text above 10 so the stat pill can't overflow; end-of-session "larger/smaller increment" reminder buttons snap custom values to the nearest preset. Same batch: Rep Rotator no longer force-logs on exit — a session with zero Clean/Miss marks leaves silently (Tempo Ladder's existing convention), the end-of-session note sheet gains "Exit without logging" + a keep-practicing ✕ (Rep Rotator only; other tools unchanged), and partial sessions log only the passages actually marked (untouched rotation members get no row, no last-used stamp, and drop out of the "with ..." list). Typecheck + web export clean; Ralph's signed-in eyeball owed on all three screens (sim test account's login expired).
- **ICU workflow batch SHIPPED 2026-08-23 (web + OTA, channel production)**: every ICU phase now caps with a FULL RUN of everything built so far at the goal tempo before the next unit is added (Ralph's long-standing ask); direction resets to forward on every launch (reverse no longer sticks from a prior session) and the finish sheet only offers a direction not yet run this sitting; direction selector out of beta; mark-units screen music now fills the screen instead of a strip; web recorder explains how to un-block a denied microphone (from user Ray's feedback email, Windows/Edge). Ralph tested pre-push on web; iPad relaunch-twice check owed.
- **First-session polish batch SHIPPED 2026-08-22 (web + OTA, channel production)**: phone taps on passage pills near the screen edge no longer trigger the back-swipe (pills/Practice bar keep 28px clear of edges); passage picker (ICU2 + Rep Rotator) sorts newest-first and floats the in-use piece to the top; ICU2 miss sheet defaults to "Start this climb over"; ICU finish sheet's "Not yet" button removed. From Ralph's first real ICU2 + backward-ICU sessions. His on-phone check owed.
- **Unified tempo prefill SHIPPED 2026-08-21 PM (web + iPad OTA)**: every tempo setup screen (Tempo Ladder, Click-Up, both Chainings, ICU2) now pre-fills from the passage's saved tempo, then the most recent decided tempo in the SAME section; stale saved sessions get a one-tap "use the newer goal" chip; starting with the untouched 120 default no longer stamps a fake tempo on the piece. Ralph's signed-in check owed (prefill values, chip, section scoping).
- **"View score" peek on tempo-setup screens SHIPPED 2026-08-21 PM (web + iPad OTA)**: while setting tempos (Tempo Ladder, Click-Up, both Chaining modes, ICU2), a button opens the full source page with the passage box outlined — page turns + pinch zoom — then straight back to setup. Ralph verified it on web. The same OTA publish (channel production, runtime 1.1.0 = build 14) carried the pending ICU2 / ICU-backward / stale-crop batch to the iPad.
- **ICU backward build + completion choice (beta) SHIPPED to web 2026-08-21 PM**: Interleaved Click-Up gains a build-direction selector (from the start / from the end, per Gebrian) and a finish-line choice: rerun the climb in the other direction or log the session. Sim-verified both directions + the two-pass log. OTA published 2026-08-21 PM (rode the score-peek update).
- **Interleaved Click-Up 2 (beta) SHIPPED to web 2026-08-21**: new multi-passage strategy from Molly Gebrian's book (rotate 3-10 fast passages through 7 fixed rounds of climbing tempos; trains first-try-at-tempo). Micro+Macro chaining merged into one "Chaining" button. Same push carried the passage-resize stale-crop fix (native, needs OTA) and the previously-unpushed IAP web-side code. OTA published 2026-08-21 PM (rode the score-peek update); his iPad receives it only on TestFlight build 14 (v1.1.0 runtime wall). Ralph's real-instrument test still owed.
- App Store: build 14 rejected 2026-08-24 on 2.1(b) — the reviewer's sandbox purchase hit our verification server and was wrongly rejected as unauthenticated (server bug, affected all purchases; found via server logs, reviewer's attempt at 9:46 AM ET). Fix written in supabase/functions/verify-apple-purchase (pass the login token to getUser explicitly, matching the other edge functions). Fix deployed + sandbox purchase verified 2026-08-24 PM (server logged the unlock; web shows Pro too). Replied + resubmitted build 14 on 2026-08-24 evening; Waiting for Review. If silent 3-4 business days, nudge Apple (expedite already used 08-20). Small Business Program enrollment submitted 2026-08-12, still pending (does not block).
- Scan-a-part flow polished 2026-08-16 (per-page fixing lives in the system scanner, naming now required, scans labeled as full parts). Wishlist logged: web photo crop + B&W, PDF export with/without annotations, forScore share-sheet import (needs next native build).
- **Tutorial videos started 2026-08-18**: the in-app "?" help popups now play short video walkthroughs Ralph records himself; library screen shipped first with 8 clips (tap-to-play menu, both platforms, no App Store build needed). He records more screens as he practices; this is the "aha channel" bet that replaced the onboarding funnel.
- **First-practice measurement screen redesigned + SHIPPED 2026-08-18** (web + iPad OTA): music window matches the passage page, real metronome on every step, "Lock in ♩ = N" commits.
- **Marketing plan drafted 2026-08-16** — see `../Marketing/`. Runs on YouTube long-form as the compounding asset, shorts as the feed, free PDFs and community exercises as the hook, quarterly live workshops.
- Open product items that the marketing plan depends on: swap the onboarding demo to lead with **click-up** instead of rhythmic variation (rhythmic is fourth by reach); the second-session coach.
