# App Store listing improvements — decided list (Ralph, 2026-09-14)

Source: outside listing critique, filtered by Ralph. The 2026-09-09 session
already shipped part of "step 1" (commit a4907dd: labeled sign-in fields;
InstallPrompt quiet-first-load amendment). Remaining work is batched below.
Do NOT relitigate the push-backs at the bottom.

## Step 1 — no review needed — DONE
- Sign-in fields labeled (visible label + accessibilityLabel): shipped
  2026-09-09 (a4907dd).
- Install prompt ("Best on a tablet or computer") quiet on a stranger's
  first phone load, prompts from the second load on: shipped 2026-09-09.
- "Why sign in" line on the plain login view: added 2026-09-14 —
  "Signing in is what saves your music and practice history to your
  account, so everything is here on any device."

## Step 2 — batch with the NEXT version submission (1.3 / next build)

These are version-locked App Store metadata or need a binary. The 1.2.0
share-sheet submission went ahead WITHOUT them (deliberate: 1.1.1 users
were cut off from OTAs until 1.2.0 released; art was not worth the delay).

1. **iPhone screenshots re-shot UPRIGHT** — highest value. Today 4 of 5
   are landscape (single squint-sized image in search results; portrait
   shows 2-3 at a glance). Narrative order: problem → guided practice →
   result. Screenshot 1 follows the Zeely ad template Ralph liked:
   outcome headline, name the enemy (mindless repetition), four strategy
   names. Kill the "All tools work on iPhone also" apology caption.
   Staging runbook: memory `pfn-screenshot-staging` (Clarinet Guy account
   rdskiano+screens@gmail.com, Bumblebee seed pipeline, caption script,
   sim capture sizes). Claude can drive the sim captures now (device
   points, not screenshot pixels); Ralph picks shots + approves captions.
2. **Subtitle** (30 chars, currently "Practice smarter, play faster" —
   generic). Candidates for Ralph's musician ear: "Master your hardest
   passages" (28) / "Drill hard passages to speed" (28) / "Fix your
   hardest passages" (25).
3. **Description**: replace "It works like magic" with what it does
   ("repetition inside an ever-changing context, so the passage holds up
   under pressure instead of only working in the practice room"). Rework
   ONLY the two jargon bullets (Interleaved Click-Up, Rep Rotator): lead
   with what each does, keep the name in parentheses. Do NOT restructure
   the whole description (push-back #6 below).
4. **Rating prompt** (needs native build): Apple's built-in one-tap
   review prompt (StoreKit requestReview) at a happy moment, e.g. right
   after a user hits their performance tempo. The app never asks today
   and has almost no ratings.

## Step 3 — after step 1 verified live
- Fill in App Store Connect accessibility declarations HONESTLY: audit
  VoiceOver on the main flows first, then declare only what works.
  (Declaring before the audit = claiming support that may be broken.)

## Push-backs (decided, don't reopen)
- #6 "Description overloaded": rejected as a whole-restructure; only the
  two jargon bullets change (see Step 2.3).
- #7 "Move the tablet modal": resolved with the second-load timing
  (shipped 2026-09-09); the modal itself stays — friend links land
  strangers on sign-in and the A2HS coaching is deliberate.
