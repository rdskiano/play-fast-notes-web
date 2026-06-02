# Play Fast Notes — Launch Plan

_Drafted 2026-06-01. Forward-looking only. ROADMAP.md is the historical log; this file is the path to public launch._

## What's being launched

Two products from one codebase:

- **Web app** at `playfastnotes.com`. Subscription. Target price: **$5/month**. Cloud-backed (Supabase). Cross-device sync is the killer feature.
- **iOS app** (universal iPhone + iPad). **$7.99 one-time** via App Store IAP, one purchase covers both devices via Apple ID. Local-first — library lives on the device, no cloud cost to operate per-user.

**Sync is the upsell, not the entry fee.** Buying the iOS app gets the native app on the device, full stop. The library stays on that device. If a user also subscribes to web ($5/mo), sync turns on: their iPad pulls from and pushes to Supabase so their library shows up everywhere. Cancel the subscription and sync stops; locally cached content stays put. iOS keeps working without the sub.

This is cleaner than "iOS = local, web = cloud, no overlap." It gives subscribers a reason to pay (sync across surfaces), keeps iOS-only users in a fair deal (paid once, owns the app, never billed again), and avoids the bridge-exploit we flagged 2026-05-31 because the sub is what pays for ongoing sync, not for one-time data migration.

## Surfaces in play

Four test surfaces. Bugs are tracked per-surface.

| Surface | Build | Notes |
|---|---|---|
| **iPhone web (PWA)** | playfastnotes.com via mobile Safari, Add-to-Home-Screen | The non-subscriber phone surface. |
| **iPhone native** | Expo iOS build, universal binary | Native phone workflow. Real screen-density work owed — see Phase B. |
| **Laptop web** | playfastnotes.com in desktop Chrome/Safari | The teacher / desk surface. |
| **iPad native** | Expo iOS build, universal binary | The design north-star workflow. |
| **iPad web** | playfastnotes.com in iPad Safari | The friend-link surface. Apple Pencil works here too. |

When this doc says "all surfaces," it means all five.

## Year-one target

50–100 paying users (from `my-company.md`). At $5/mo web + $7.99 iOS, this is a small-revenue, real-validation year. Don't price-defensively against egress; Supabase Pro has headroom through ~125–500 active users.

---

## Phase A — Bug elimination protocol (week 1)

The "chasing bugs in circles on three devices" problem is the active pain. Solve it before adding any new feature work.

**Deliverable:** `BUGS.md` at the repo root (this session ships the template; you do the first triage walk).

**Workflow:**

1. **First triage pass.** Surface by surface, run the smoke checklist below. Log every issue you can reproduce into `BUGS.md` with: short title, reproduction steps, affected surfaces (often more than one), severity. Don't fix anything yet. Just log.
2. **Triage.** Sort by severity. P0 = blocks the launch. P1 = embarrassing but launchable. P2 = nice-to-have.
3. **Fix loop.** Pick the top bug. Make the fix. **Verify on every listed surface before closing.** If the fix was on web, you still verify iPad-web (same code) and iPad-native (might share a component) and iPhone PWA (same web bundle but different viewport).
4. **Class scan.** When you fix one bug, grep the codebase for the same class — DOM globals in shared files, missing platform guards, the same off-by-one, etc. Fix the whole class in the same pass. CLAUDE.md already names this as a known failure mode ("Latent web-only code… fix the whole class — not just the one instance").
5. **Weekly regression.** Once a week through launch: run all smoke checklists. Anything that broke since last week is logged. Anything that was logged but no longer repros is closed.

**Smoke checklists** (per surface, ~5 minutes each):

Per-surface checklists live as the appendix of `BUGS.md`. They're short on purpose. Build them up over time — add a new item every time a bug ships with no smoke-test coverage that would have caught it.

**Rule:** No new feature work while P0 bugs are open. Web cutover already happened (2026-05-24, per ROADMAP.md); the live site is real users now.

---

## Phase B — Pre-monetization parity (1–2 weeks)

Things already on the open-threads list that should ship before Stripe goes live.

1. **Rep Rotator authenticated smoke test on live web.** Shipped 2026-05-29; not yet click-tested on a logged-in account. Library 🔀 → config → select → "?" → first-run TutorialStep, plus the passage-pill seed.
2. **iPad cutover.** Per CLAUDE.md: `playpreview` from this repo, install on the physical iPad over the existing learn-fast-notes build, verify all practice flows on device. Then archive `../learn-fast-notes/`. This unblocks all native bug verification — right now you're testing on Xcode dev clients built from the *old* repo, which means iPad bugs you find aren't necessarily bugs in the code we're about to ship.
2a. **iPhone native UX pass.** The native iOS build today is designed for iPad. The web phone-density pass (commits `3d031c2`/`17767f6`) proves the phone UX patterns work — small floating rep buttons, hidden top bar, icon-only tool tabs, score zoom — but those changes live in `.web` files. Porting them to the native phone path is real work. Plan to spend a focused chunk (estimate 5–10 sessions) on this between iPad cutover and Stripe. The questions to answer: does the camera capture flow work natively on iPhone, do all four practice strategies feel right on a 6.1" screen, does the pencil tab disappear correctly on iPhone (no Pencil there), does the recorder work on iPhone's mic.
3. **Push the pending PDF-on-device + score-framing + pinch-zoom commits** (currently 4 commits ahead of `web-origin-archive/master` per ROADMAP 2026-05-30 entry). Smoke-test, then push. These are real fixes already done; they shouldn't sit on local disk through launch.
4. **Pre-existing TS errors in self-led routes** — `app/passage/[id]/self-led/[key].tsx`, `recording.tsx`. Cheap cleanup. Do it next time you touch those routes.
5. **Microbreak timer trigger verification** — `microbreak.trigger()` may or may not be wired into any practice flow after the rework. Confirm or fix.
6. **Tuner placeholder cleanup** — verify no orphan Tuner references remain anywhere.

Items 4–6 are housekeeping but cheap. Worth clearing before paid tier so they're not in the post-launch bug list.

## Phase C — Monetization plumbing (2–4 weeks)

Three things, in this order.

### C1 — Web subscription (Stripe)

- Stripe account, products, prices. One product, one price: `$5/mo` recurring USD. Add annual later if asked.
- `subscriptions` table in Supabase keyed on `user_id` with: `stripe_customer_id`, `status` (active / past_due / canceled / trialing), `current_period_end`, `cancel_at_period_end`.
- Stripe checkout flow from a `/subscribe` route. Stripe webhook → Supabase row update.
- Entitlement check on web: free tier is fully usable for a defined free band — pick one (5 passages? 30 days? whichever doesn't blunt the friend-link viral path). Past the band, prompt for subscription.

**Open question for you:** what's the free-tier ceiling on web? Three options worth considering:
- Time-based free trial (e.g. 14 days fully unlocked, then read-only without a sub)
- Library-size cap (e.g. 5 passages, unlimited otherwise)
- Feature-gated (e.g. recorder + sync + pencil persistence behind paywall; tempo ladder and metronome free forever)

Each has trade-offs. We can decide when you're ready. Don't decide now.

### C2 — Sync entitlement (subscription = sync activation)

iPad is already local-first (SQLite + sandbox files; ROADMAP confirms). What changes:

- Reuse the optional `/import-supabase` dev route as the foundation, but flip it from "manual one-shot pull" to "background sync, activated by subscription status."
- On iPad app launch: check subscription status (Supabase query on the signed-in user). If active → enable sync. If not → local-only, no Supabase reads/writes for content.
- Sync writes-through new passages, edits, practice log, pencil annotations. The existing `lib/db/repos/*.ts` seam is built for this.
- Subscription lapse: stop sync. Locally cached content stays. iPad keeps working in local mode. The subscriber knows ahead of time (Stripe sends the "your subscription is ending" email) so this isn't a surprise.

### C3 — iOS one-time purchase ($7.99 App Store IAP)

- StoreKit 2 in-app purchase. Single non-consumable product: `com.playfastnotes.app.unlock`.
- App opens to a paywall on first launch. After purchase, the unlock is restored across the user's Apple devices via Apple ID.
- No free trial on iOS at launch. Apple's purchase-then-refund is the de facto trial; don't build our own.
- Sandbox-test purchase + restore on TestFlight before submitting.

**Sequencing note:** C1 and C3 can run in parallel — different code paths, different platforms. C2 depends on C1 (the subscription state is what activates sync).

## Phase D — TestFlight + App Store (1–2 weeks)

- TestFlight build with C3 wired up. Invite 5–10 friends (musicians, ideally) for real-device validation. Make sure the friend mix covers both iPhone and iPad — testers default to using whichever Apple device is closest.
- App Store listing: screenshots from iPad landscape (the design north star), iPad portrait, iPhone portrait. Copy says what the app does in plain language (no "transform your practice" stuff — voice from `writing-rules.md` applies).
- Price: $7.99 USD. Available worldwide. Universal binary ("Compatibility: iPhone and iPad").
- Submission. Pull current App Review wait times from developer.apple.com before submitting so the timeline you commit to is real, not remembered. Allow extra time for the first submission in case of a rejection round.

## Phase E — Public launch

- Stripe live (out of test mode).
- App Store listing approved.
- One announcement post on ralphskiano.com (web is the channel per `my-company.md`).
- Friend-network share — the people who've been test-driving become the first paying users / advocates.
- DO NOT do paid marketing. `my-company.md` is explicit: no marketing push before paid tier + polish are ready, and even then the goal is real-user validation, not volume.

## Phase F — Year-one operating

- Watch the bug list. Every week.
- Watch subscription churn. If users cancel inside 30 days, find out why (one-line email, no survey).
- Don't add new features until 25+ paying users. Polish > breadth for year one.
- Revisit the Audition Prep App + Practice Room Playbook conversations only after PFN is funded and stable.

---

## What this plan deliberately doesn't do

- **No teacher tier.** `my-company.md` and the 2026-06-01 monetization session both pushed back on teacher pricing as a launch feature. Individual sales first; teacher/studio pricing waits for validated demand.
- **No free trial on iOS.** The App Store doesn't make trials easy and Ralph's pricing is already low. Apple's refund window is the de facto trial.
- **No bundle deal.** $5/mo web + $7.99 iOS sold separately. Bundling complicates the entitlement story and customers buy what they need.
- **No new features pre-launch.** Bug elimination + monetization plumbing only. The product is already feature-rich (per ROADMAP — Tempo Ladder Custom, Rep Rotator, Recorder, Pencil, four timers, Rhythms metronome, PWA, etc.). Ship what's there.

## What's owed to update existing docs

- `memory.md` lists "PFN web parity work — Steps 1–5 shipped" but the cutover entry there is stale. It says "Steps (6) friend-test, (7) cutover live deploys, (8) Stripe roll forward." Per ROADMAP and CLAUDE.md, the **web cutover already happened 2026-05-24**. Updating the active-projects entry in memory.md is owed.
- This plan supersedes the open-threads "PFN web parity work" line and replaces it with Phases A–F.
