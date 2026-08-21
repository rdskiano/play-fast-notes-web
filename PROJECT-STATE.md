# Play Fast Notes — current state

**As of 2026-08-20.** One screen, deliberately. Anything longer belongs in `CLAUDE.md` or `ROADMAP.md`.

**Why this file exists.** `CLAUDE.md` is thorough but 75 KB, so nothing outside a terminal session reads it. Cowork sessions (marketing, strategy, planning) read *this* file plus live database numbers. Between 2026-06-26 and 2026-08-16 the Cowork side had no idea the price had changed from a $39/yr subscription to a $19.99 one-time unlock, and a full marketing plan got built on the wrong number. This file is the join.

**Maintenance rule.** Update this at the end of any session that changes product state: price, platform status, what shipped, what the current workstream is. Overwrite the stale lines, do not append a log. Keep it under one screen.

---

## Product

- **Web** — live at playfastnotes.com, ships from this repo. Where all paid conversion happens today.
- **iPad / iPhone** — build 13 REJECTED by Apple 2026-08-20 (guideline 3.1.1: Pro surfaces visible with no In-App Purchase). Apple IAP built same day (expo-iap + server-side receipt verification, same $19.99 lifetime unlock, cross-platform with web); awaiting Ralph's App Store Connect product setup + a new build (v1.1.0) + resubmit. Buying on either platform unlocks both.
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

- **ICU backward build + completion choice (beta) SHIPPED to web 2026-08-21 PM**: Interleaved Click-Up gains a build-direction selector (from the start / from the end, per Gebrian) and a finish-line choice: rerun the climb in the other direction or log the session. Sim-verified both directions + the two-pass log. OTA publish = Ralph's command.
- **Interleaved Click-Up 2 (beta) SHIPPED to web 2026-08-21**: new multi-passage strategy from Molly Gebrian's book (rotate 3-10 fast passages through 7 fixed rounds of climbing tempos; trains first-try-at-tempo). Micro+Macro chaining merged into one "Chaining" button. Same push carried the passage-resize stale-crop fix (native, needs OTA) and the previously-unpushed IAP web-side code. OTA to production = Ralph's command; his iPad receives it only on TestFlight build 14 (v1.1.0 runtime wall). Ralph's real-instrument test still owed.
- App Store: build 13 rejected 2026-08-20 morning on 3.1.1 (no IAP); Apple IAP built, deployed (DB migration + verify edge function live), and v1.1.0 build 14 RESUBMITTED with the pfn_pro_lifetime purchase the same day, ~3 PM. Waiting for Review. Open: Ralph's TestFlight sandbox purchase test on build 14. Small Business Program enrollment submitted 2026-08-12, still pending (does not block).
- Scan-a-part flow polished 2026-08-16 (per-page fixing lives in the system scanner, naming now required, scans labeled as full parts). Wishlist logged: web photo crop + B&W, PDF export with/without annotations, forScore share-sheet import (needs next native build).
- **Tutorial videos started 2026-08-18**: the in-app "?" help popups now play short video walkthroughs Ralph records himself; library screen shipped first with 8 clips (tap-to-play menu, both platforms, no App Store build needed). He records more screens as he practices; this is the "aha channel" bet that replaced the onboarding funnel.
- **First-practice measurement screen redesigned + SHIPPED 2026-08-18** (web + iPad OTA): music window matches the passage page, real metronome on every step, "Lock in ♩ = N" commits.
- **Marketing plan drafted 2026-08-16** — see `../Marketing/`. Runs on YouTube long-form as the compounding asset, shorts as the feed, free PDFs and community exercises as the hook, quarterly live workshops.
- Open product items that the marketing plan depends on: swap the onboarding demo to lead with **click-up** instead of rhythmic variation (rhythmic is fourth by reach); the second-session coach.
