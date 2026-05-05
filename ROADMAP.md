# Play Fast Notes — Web Roadmap

_Last updated: 2026-05-03 (evening)_

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
  iPad, repos mirroring iPad signatures, schema.sql with RLS policies.
- **Phase 2 chunk 1 — auth + library**: useSession-based auth gate, sign-in
  screen with email + password, signup-or-signin smart Continue, single-tab
  layout matching iPad, library v1 (folders + pieces + search + empty state).
- **Phase 2 chunk 2 — first practice flow**: upload (title + composer only),
  piece detail (strategy picker), Tempo Ladder v1 (step mode only).
- **Phase 2 chunk 3 — image storage + crop**: Supabase Storage bucket `pieces`
  with RLS, browser file picker swapped in for the upload form, cropper UI
  (`InlineCropper` overlay), thumbnails rendered in library and piece detail.
  Crop save **cache-busts the storage URL with `?v=<Date.now()>`** so re-cropped
  JPEGs display the new bytes (browsers and the Supabase CDN otherwise serve
  the stale path).
- **Phase 2 chunk 4 — practice strategy parity**:
  - **Tempo Ladder full parity**: cluster mode + step mode, `BpmStepper`,
    `useTempoLadderSession` hook, `FloatingSlowClickUpControls` (drag +
    pinch), `CelebrationModal`, `PracticeLogNotePrompt`, subdivision support
    in `useMetronome`.
  - **Interleaved Click-Up**: marking → config → playing flow,
    `ScoreWithMarkers` with tap-to-mark, `useClickUpSession`,
    `FloatingClickUpControls`, `TempoConfigFields`.
  - **Rhythmic Variation (Rhythm patterns only path)**: 2-step bottom sheet
    on piece detail, grouping picker (3-8), `AbcStaffView` (abcjs via CDN
    script tag, no npm dep), `FloatingMetronome`, `FloatingRhythmCard`,
    rhythm-loop scheduler in `useMetronome` (`startRhythmLoop` /
    `stopRhythmLoop` / `toggleRhythmLoop`).
- **Phase 2 chunk 5 — log views**: per-piece **Practice History** screen
  with section list grouped by date and edit/delete entry; **library-wide
  Practice Log** with By date / By folder grouping, edit/delete entries.
- **Phase 2 chunk 6 — multi-page passage**: two-page composite uploads
  (`/multi-page` route), per-page crop via `InlineCropper`, canvas-stacked
  composite save, `dismissAll` + push so back-from-piece returns to library.
- **Phase 2 chunk 7 — settings**: settings screen ported.
- **Phase 2 chunk 8 — Exercise Builder (Rhythmic Variation, Exercise Builder
  branch)** shipped in 4 slices:
  - Slice A: `rhythm-list` (saved-exercises list with Edit/Rename/Delete + new-exercise
    PromptModal). Reached from the Rhythmic Variation modal on piece detail.
  - Slice B: builder Setup phase — score thumb, Instrument / Key / Clef
    `DropdownField`s, `GroupingPicker` (3-8). Selections persisted to
    `exercises.config_json`. Ports `lib/music/pitch.ts` (instruments, clefs,
    key signatures, transposition, key-aware spelling).
  - Slice C: builder Entry phase — full 88-key `PianoKeyboard` (`onPressIn`
    so taps fire instantly), `PitchStaff` powered by `buildPitchAbc`,
    `NoteCardEditor` (enharmonic respell, courtesy accidental, insert
    before/after, delete), transport row (Play / Switch sharps↔flats /
    Undo / Clear / Generate). `useMetronome` extended with `playPitch`,
    `playPitchSequence`, `playPitchRhythm`, `stopPitchSequence`. Pitches
    persisted to `exercises.config_json` (debounced 400 ms).
  - Slice D: builder Generate phase — one row per rhythm pattern with
    a row header (`#71 · 3/4`, rhythm tokens) and a wrapped pitched staff
    rendered by an extended `AbcStaffView` (`wrap`, `preferredMeasuresPerLine`,
    `fallbackText`, `onNoteTap`, `activeNoteIndex`). PDF export mirrors iPad's
    `expo-print` pipeline by opening a popup window with `lib/export/buildExerciseHtml.ts`
    and triggering `window.print()`. Per-pattern playback uses
    `playPitchRhythm`. EDIT button returns to Entry; DONE opens
    `PracticeLogNotePrompt` and logs a `rhythmic` practice entry tied to the
    exercise; auto-routes to Generate when re-opening an exercise that has
    saved pitches.
- **Phase 2 chunk 9 — Chunking**: ported `piece/[id]/chunking.tsx` with the
  How-to-chunk help modal and DONE flow that logs a `chunking` practice entry.
  Reached via the Chunking pill on piece detail (replaced the iPad's
  `Unguided ▾` since chunking is currently the only unguided strategy on
  web).
- **Phase 2 chunk 10 — Serial Practice (Interleaved)** shipped in 3 slices:
  - Slice A: `/interleaved` route with **config** (Practice mode + Order +
    helper copy + numeric chip row that swaps between Clean reps 3/5/10 and
    Minutes per passage 3/5/10/15) and **select** (folder-grouped piece
    multi-select; Serial shows order numbers, Interleaved shows
    checkmarks). Library top-bar Serial Practice toggle wired up. Ports
    `Chip` primitive.
  - Slice B: **Consistency-mode active screen** — passage title + completed
    count + N streak dots + END button, floating metronome, score
    full-bleed, Clean/Miss buttons. Serial walks the array in entry order
    skipping completed. Interleaved uses the iPad lap algorithm (each
    uncompleted passage once per lap, missed passages front-loaded next
    lap). Celebration on all-complete; Save & finish writes one
    `practice_log` row per passage tagged `interleaved` with `mode`,
    `order`, `target_reps`, `streak`, `completed`, `tempo`, `mood`, `note`.
  - Slice C: **Timer-mode active screen + cross-screen session
    singleton** (`lib/sessions/serialPractice.ts`). Module-level state +
    `setInterval` so the countdown keeps ticking when the user taps a
    strategy launch button (Tempo Ladder / Click-Up / Rhythmic Variation)
    and navigates to that screen. `useSyncExternalStore` re-syncs the
    component on mount, so coming back resumes the session. Bottom timer
    bar with `M:SS · passage title · Next Serial piece`. Manual advance
    only — when time hits 0:00 the bar turns red but no auto-advance.
- **Vercel deploy + `playfastnotes.com`**: live, auto-deploys on push to
  `master`. **`vercel.json` SPA rewrite** added 2026-05-03 so deep links and
  reloads on `/library`, `/passage/[id]/...` etc. resolve to `index.html`
  instead of 404 (Expo Web exports a single index.html and routes
  client-side).
- **Phase 0 vocabulary rename** (2026-05-03 evening): `piece` → `passage`
  across all UI copy, TS types, function names, file names, and route
  paths on both iPad and web. SQL table stays `pieces`; FK columns stay
  `piece_id`. See iPad ROADMAP for the cross-repo motivation; see this
  repo's CLAUDE.md "Vocabulary" section for the TS/SQL split.
- **Force-light color scheme**: web app no longer respects iPhone Safari's
  dark-mode preference (the dark variant of the palette has not been
  audited). `hooks/use-color-scheme.ts` always returns `'light'`.
- **Folder Log** (`folder-log`) — per-folder practice log mirroring
  iPad's `folder-log.tsx`. Library's Practice Log button routes by context:
  inside a folder it pushes `/folder-log?folderId=...`, at root it pushes
  `/library-log`. (Initial port had `getPracticeLogForFolder` using
  embedded PostgREST joins which silently returned empty; rewrote to
  separate-fetch + JS join, matching the rest of `practiceLog.ts`.)
- **rhythm-list edit-mode reorder**: ↑↓ buttons in Edit mode (mirrors the
  Library reorder pattern). Lighter than iPad's drag gesture but
  functional. Calls `updateExerciseSortOrder`.
- **iPad-parity audit fixes** (2026-05-02):
  - Strategy color customization now actually applies on web. Piece-detail
    pills + library tempo % badge read from `useStrategyColors()` instead
    of hard-coded hex.
  - Stray `console.log`s removed from `library.tsx` reorder path.
- **rhythm-builder floating metronome**: same `FloatingMetronome` used by
  Rhythmic Variation patterns-only path now mounts on the Exercise Builder
  generate phase, so the user can practice along with ticks. Reuses the
  existing `useMetronome` instance already plumbed through `ExercisesPhase`.
- **Branded icon + favicon + apple-touch-icon**: replaced React-template
  defaults with the Midjourney-generated music-notes-with-motion-lines
  icon. 1024×1024 `assets/images/icon.png`, 48×48 `assets/images/favicon.png`,
  180×180 `public/apple-touch-icon.png` (iOS Safari Add-to-Home-Screen
  doesn't read the standard favicon — looks for this file at the root).
- **Feedback button**: floating bottom-right `💬 Feedback` button on every
  signed-in screen (`components/FeedbackButton.tsx`), POSTs to a Formspree
  endpoint (`mjglgqve`) with the user's signed-in email, Supabase userId,
  current page URL, user agent, and timestamp. Email field is the Formspree
  reply-to convention so hitting Reply in Gmail jumps straight to the user.
  Override the endpoint via `EXPO_PUBLIC_FORMSPREE_URL` if needed.
- **`/import-seed` dev tool** (`app/import-seed.tsx`): unlinked one-off
  route to load an iPad seed-export.json into Supabase for testing,
  including base64-decoded image upload to the `pieces` storage bucket.
  Per-table `.neq(col, '__never__')` wipe predicate so it works against
  every table regardless of which timestamp columns exist. Reach via
  direct URL only.
- **Documents + passages — Phase 1 + 1.5** (2026-05-04 → 2026-05-05):
  Full PDF-import-and-mark workflow shipped on web. Highlights:
  - **Edge Functions** `pdf-render-page` and `pdf-doc-init` (Deno + WASM)
    using `@hyzyla/pdfium` + `@jsquash/jpeg`. One page per invocation
    (CPU budget) with parallel client fan-out. Auth fix:
    `supabase.auth.getUser(token)` not `getUser()` — the Edge runtime
    does not auto-resolve the session from the header.
  - **Schema**: `documents` table with RLS, additive `pieces.document_id`
    + `pieces.regions_json`, additive `documents.sections_json`.
  - **Upload flow** (`/document-upload`): native `<label htmlFor>` for
    file picker (more reliable than JS `.click()`), progress UI with
    phase + page counts, then `lib/pdf/upload.ts` orchestrates upload →
    init → fan-out renders → insertDocument.
  - **Library cards**: documents are first-class peers with folders and
    passages (`DocumentCard` with thumbnail anchored to top of page 1
    via `contentPosition="top"`). Document-derived passages hidden from
    top-level library (filter `pieces.document_id IS NULL`).
  - **Document viewer** (`/document/[id]`): horizontal pagingEnabled
    ScrollView, **two-page spread in landscape** (auto-derived from
    `useWindowDimensions`, override toggle for users who want single
    in landscape). Marking via drag-rectangle (`PassageRectDrawer`),
    multi-page passages stitched via `stitchVertically`, resize with
    8-handle drag (`PassageRectResizer`), select via tap → `ActionSheet`
    with Practice / Rename / Resize / Delete.
  - **Sections / Movements**: tap-to-mark via `SectionMarkerCapturer`
    captures `(page, start_y)` so a movement starting mid-page is
    recorded that way. Naming uses native `window.prompt` — RN-Web
    Modal+TextInput hopped the keyboard and shifted the underlying
    ScrollView, native dialogs don't. Sections list / nav / rename /
    delete via `SectionsModal`. Current section name renders under the
    document title.
  - **Practice log document-aware**: library + folder log entries for
    document-derived passages render as "Mahler 9 · IV. Adagio · bars
    281-291", standalone passages unchanged.
  - **iPad Safari quirks** (workarounds documented in code comments):
    - `dimensionsBaselineRef` freezes the dimensions used to derive
      viewMode during any save flow — keyboard-induced viewport resize
      otherwise flips single → spread, and the orientation effect maps
      back to the wrong page on dismiss.
    - `onScroll` wired with throttle so `currentIndex` tracks the
      actual visible screen reliably (iPad Safari + macOS Chrome
      both fire `onMomentumScrollEnd` inconsistently).
    - `suppressScrollEndRef` window through the entire passage-save
      chain (prompt → post-save sheet + 1s tail) so trailing keyboard
      dismiss scroll events cannot drift `currentIndex`.
    - `scrollEnabled=false` during draw mode again, since the previous
      page-1 reset symptom turned out to be the viewMode flip and is
      now fixed by the dimension freeze.

- **Library log document grouping** (2026-05-05): in `library-log.tsx`
  by-folder view and `folder-log.tsx`, document-derived passages now
  sub-group under document title → section name, so users see
  `Folder → Mahler 9 → III → 12-2` instead of a flat list of
  `Mahler 9 · III · 12-2` labels. Standalone (non-document) passages
  still render flat under the day. By-date view in library-log is
  unchanged. Aligns "by folder" with "by full part" so they read as
  the same idea applied to different containers.

- **Self-Led practice — Phase 2** (2026-05-05): broader umbrella replacing
  the standalone Chunking pill. One **Self-Led ▾** outline pill on the
  passage screen opens a bottom sheet with six strategies, each with an
  expandable info chevron showing long description + steps:
  - Chunking, Add a Note, Pitch / Intonation, Phrasing, Freeform → all
    route to a generic session screen (passage image + DONE + mood/note).
  - Recording → dedicated route with `MediaRecorder` state machine
    (`idle → recording → recorded → saving`); blob uploads to a new
    `recordings` Supabase Storage bucket; `data_json` carries
    `recording_uri`, `recording_id`, `duration_seconds`.
  - Practice log views (library-log, folder-log, document-log, passage
    history) extended with the new STRATEGY_LABELS, recording duration
    in `formatDetail`, and an inline `<audio controls>` player below the
    pill when an entry has a `recording_uri`.
  - One-time Supabase setup: new `recordings` bucket + RLS policies (see
    `CLAUDE.md`).

### 🚧 Next up (in priority order)

1. **Library polish v2**: edit mode (rename, move, delete, reorder), folder
   creation, move-to picker. Up/down arrows first; defer drag-and-drop.
2. **Search across pieces and exercises**.

### ⏳ Deferred document/section UX (revisit when convenient)

- **Inline rename for sections**: native `window.prompt` works but is
  Safari-styled. A custom non-Modal in-page input would feel more
  cohesive — but the Modal+TextInput route triggers iPad Safari's
  underlying-ScrollView shift. Worth revisiting if window.prompt
  starts being suppressed in future Safari versions.
- **iPad parity for documents**: orchestrator + repos already in repo;
  needs `expo-document-picker` (new native module) and a fresh
  `playbuild` to install. Not started.
- **Persistent boxes-on/off and view-mode override per document**:
  currently in-memory only.

### ⏳ Polish for shipped screens

- **Exercise Builder PDF**: PDF export currently strips per-exercise time
  signature and rhythm-token labels (intentional, per request) — only the
  pattern number remains. Revisit if the labels need to come back.
- **AI score-scan + mic-based pitch entry** (the two non-keyboard pitch entry
  modes from iPad's Exercise Builder) — deferred. Browser file-input is the
  permanent fallback; mic recording is feasible but unprioritised.

### ⏳ Later

- **Practice timers** (the iPad's `GlobalTimerTray` / `PracticeTimersContext`)
  — already wired; tweak/expand if needed.
- **Responsive layout polish for phone-sized browsers** (currently
  iPad-shaped).
- **Audio recording / pitch detection** — defer; browser audio recording is
  feasible but not prioritized for the testing surface.

### 🛑 Deferred (rationale)

- **Stripe subscriptions** — Phase 4.4 of the iPad roadmap. The
  `subscriptions` table is created empty so wiring drops in cleanly later.
  Deferred until the testing phase produces enough conviction to charge.
- **Practice-log sync between iPad and web** — Phase 4.3 of the iPad
  roadmap. The iPad continues using local SQLite for now; cross-surface sync
  is its own project.
- **Document scanner** — no web equivalent for the iPad's
  `react-native-document-scanner-plugin`. The browser file picker is the
  permanent web equivalent; the camera-scan affordance is iPad-only.

---

## Phasing relative to iPad ROADMAP

The iPad roadmap names this entire effort "Phase 4 — Web version migration."
Within Phase 4 there are sub-phases:

- **Phase 4.1** (port design tokens) — ✅ done.
- **Phase 4.2** (rebuild web UI to match; **Self-Led / Phase 2 also shipped here on 2026-05-05**) — feature-complete for all
  practice flows. Single-piece (Tempo Ladder, Click-Up, Rhythmic Variation
  patterns-only path, Rhythmic Variation Exercise Builder all 4 slices,
  Chunking, Practice History) and multi-piece (Serial Practice in both
  Consistency and Timer modes). Remaining: folder-log, library polish v2,
  search.
- **Phase 4.3** (shared backend) — partially done. Auth + per-user data
  isolation work; cross-surface sync deferred.
- **Phase 4.4** (Stripe subscriptions) — not started. Schema slot exists.

---

## Reference

- Source-of-truth product docs: `../learn-fast-notes/ROADMAP.md`,
  `../learn-fast-notes/CLAUDE.md`.
- Locked vocabulary (Tempo Ladder, Interleaved Click-Up, Rhythmic Variation,
  Chunking, Serial Practice) — see iPad ROADMAP § Vocabulary.
- iPad screens to mirror — `../learn-fast-notes/app/`.
- iPad design tokens — `../learn-fast-notes/constants/tokens.ts` (copy
  verbatim into this repo when updated).
- iPad reference screenshots used for porting — `reference-screenshots/ipad/`.
