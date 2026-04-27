# Play Fast Notes — Web Roadmap

_Last updated: 2026-04-26_

Granular roadmap for the web companion. Sibling to the iPad app at
`../learn-fast-notes/`. Product direction, vocabulary, and design principles
live in `../learn-fast-notes/ROADMAP.md` — this document only tracks
implementation milestones for the web surface.

---

## Vision

`playfastnotes.com` — a browser-based companion that lets working musicians
and teachers (and students who rise to the tool) practice with the same
guided strategies as the iPad app. Web is the universal fallback for anyone
without an iPad, and eventually the surface where Stripe-direct subscriptions
happen.

iPad is the design north star; web follows. They share a Supabase backend for
auth, practice log, and (later) subscription state.

## Tech stack

- **Framework**: Expo Web (React Native Web) — lets us copy iPad components
  and adapt minimally rather than rewriting in plain React.
- **Backend**: Supabase (Postgres + RLS + Auth + Storage).
- **Auth**: email + password (magic link disabled for testing-phase friction;
  may revisit at Phase 4.4).
- **Hosting**: Vercel, GitHub auto-deploy from `master`.
- **Domain**: `playfastnotes.com`.

## Current status

### ✅ Done

- **Phase 1 — bootstrap**: fresh Expo SDK 54 project, web platform configured,
  `@supabase/supabase-js` installed, design tokens + primitives copied from
  iPad, 8 Supabase-backed repos mirroring iPad signatures, schema.sql with
  RLS policies, CLAUDE.md.
- **Phase 2 chunk 1 — auth + library**: useSession-based auth gate, sign-in
  screen with email + password, signup-or-signin smart Continue, sign-out
  button in library header, single-tab layout matching iPad, simplified
  library v1 (folders + pieces + search + empty state — edit mode deferred).
- **Phase 2 chunk 2 — practice flow**: upload (title + composer only),
  piece detail (strategy picker), Tempo Ladder v1 (step mode only, Web Audio
  metronome, mark Clean / Missed, advance on streak, log practice on Done).

### 🚧 Next up (in priority order)

1. **Image upload + display**. Set up Supabase Storage bucket + RLS, swap
   browser file picker for the upload form, render thumbnails in library and
   piece detail. Probably also a quick crop step (web equivalent of iPad's
   crop screen — could defer if time-pressed).
2. **Other strategies**: Interleaved Click-Up, Rhythmic Variation, Chunking.
   Click-Up is the most-different from Tempo Ladder; Rhythmic and Chunking
   are simpler.
3. **Practice history / log views**: per-piece history screen, library-wide
   practice log. Repos already exist — just need UI ports.
4. **Settings screen**: at minimum, account info + sign-out (currently
   sign-out lives in library header as a temporary home).
5. **Library polish v2**: edit mode (rename, move, delete, reorder), folder
   creation, move-to picker. Defer drag-and-drop until last; up/down arrows
   first.
6. **Deploy to Vercel + attach `playfastnotes.com`**: probably *before*
   feature parity — once the practice flow works for one strategy, the site
   is shareable. Iterate on production-deployed code.

### ⏳ Later

- Practice timers (the iPad's GlobalTimerTray / PracticeTimersContext) —
  cosmetic for the web testing surface; not a blocker.
- Serial Practice mode (interleaved/blocked) — complex; the iPad's
  `_activeSession` module-level state needs a Zustand replacement first
  (Phase 3.2 of the iPad roadmap).
- Self-Led strategies index (Phase 2 of iPad roadmap).
- Search across pieces and exercises.
- Crop screen + multi-page PDFs.
- Responsive layout polish for phone-sized browsers (currently iPad-shaped).

### 🛑 Deferred (rationale)

- **Stripe subscriptions** — Phase 4.4 of the iPad roadmap. The
  `subscriptions` table is created empty so wiring drops in cleanly later.
  Deferred until the testing phase produces enough conviction to charge.
- **Practice-log sync between iPad and web** — Phase 4.3 of the iPad
  roadmap. The iPad continues using local SQLite for now; cross-surface sync
  is its own project.
- **Audio recording / pitch detection** — `RECORDING_ENABLED = false` on
  iPad, no plan to enable on web. Browser audio recording is feasible but
  not prioritized for the testing surface.
- **Document scanner** — no web equivalent for the iPad's
  `react-native-document-scanner-plugin`. The browser file picker is the
  permanent web equivalent; the camera-scan affordance is iPad-only.
- **Migrating the user's personal iPad data** — the user explicitly chose
  empty start for testing. Cross-surface sync (above) covers this later.

---

## Phasing relative to iPad ROADMAP

The iPad roadmap names this entire effort "Phase 4 — Web version migration."
Within Phase 4 there are sub-phases:

- **Phase 4.1** (iPad roadmap step 1: port design tokens) — ✅ done.
- **Phase 4.2** (iPad roadmap step 2: rebuild web UI to match) — 🚧 in
  progress; ~3 of ~12 screens functional.
- **Phase 4.3** (iPad roadmap step 3: shared backend) — partially done. Auth
  + per-user data isolation work; cross-surface sync deferred.
- **Phase 4.4** (iPad roadmap step 4: Stripe subscriptions) — not started.
  Schema slot exists.

---

## Reference

- Source-of-truth product docs: `../learn-fast-notes/ROADMAP.md`,
  `../learn-fast-notes/CLAUDE.md`.
- Locked vocabulary (Tempo Ladder, Interleaved Click-Up, Rhythmic Variation,
  Chunking, Serial Practice) — see iPad ROADMAP § Vocabulary.
- iPad screens to mirror — `../learn-fast-notes/app/`.
- iPad design tokens — `../learn-fast-notes/constants/tokens.ts` (copy
  verbatim into this repo when updated).
