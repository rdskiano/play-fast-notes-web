# Play Fast Notes — unified app (working notes for Claude)

This is **the unified Play Fast Notes codebase** — one Expo project that targets both **iOS (iPad)** and **web** from a single source tree. It supersedes the old split between `learn-fast-notes/` (iPad-only) and `play-fast-notes-web/` (web-only). Those repos still sit next door at `../learn-fast-notes/` and `../play-fast-notes-web/` as **read-only archives** — reference them when porting historical decisions, never edit them.

The user is **not a developer**. Always give them one-word terminal shortcuts (e.g. `playfast`, `playweb`), never long `cd ... && npx ...` lines that break on paste due to spaces in paths.

> **🔄 Status as of 2026-05-24 — web cutover DONE; iPad cutover pending.** `playfastnotes.com` now ships from THIS repo. The remote `web-origin-archive` (alias name kept from before cutover, despite the misleading word "archive") points at `rdskiano/play-fast-notes-web` — Vercel auto-deploys its `master`. So `git push web-origin-archive master` IS a live deploy. Treat it that way: smoke-test the web build before pushing. The physical iPad still runs Xcode-built dev clients from `learn-fast-notes/` — that side of the cutover hasn't happened yet. EAS is wired to this repo (slug `learn-fast-notes`, project `c2ba6a6f…`) and will build from here whenever we run `playbuild` / `playpreview`. **Most recent workstream (2026-05-23 → 24): web parity, phone density, timer overhaul, keyboard advance.** See ROADMAP.md for the full log. **Current workstream**: friend-test the live web build, then iPad cutover, then Stripe (Phase 4.4.2).

## Where this lives

- Working directory: `~/Desktop/COWORK/PROJECTS/APPS/PlayFastNotes/play-fast-notes/`
- Git: single remote, `web-origin-archive` → `rdskiano/play-fast-notes-web.git`. **This is the live web deploy.** The remote alias kept the "archive" name from before cutover; despite the name, pushing to it ships to playfastnotes.com via Vercel.
- Sibling layout:
  ```
  ~/Desktop/COWORK/PROJECTS/APPS/PlayFastNotes/
  ├── learn-fast-notes/        ← old iPad repo (read-only archive; physical iPad still runs this until iPad cutover)
  ├── play-fast-notes-web/     ← old web repo (now a read-only archive; the GitHub repo of the same name is the LIVE web upstream for THIS repo)
  ├── play-fast-notes/         ← unified — YOU ARE HERE
  └── Play Fast Notes — Reference/  ← cross-cutting SOPs, runbooks
  ```

## Day-to-day commands

```
playweb     # npm run web → opens http://localhost:8081 in browser
playfast    # npx expo start --dev-client → Metro for iOS simulator/device
playbuild   # npx eas-cli build --profile development --platform ios
playpreview # npx eas-cli build --profile preview --platform ios (standalone .ipa)
```

All four aliases live in `~/.zshrc` and point at this directory. Plus `LANG=en_US.UTF-8` / `LC_ALL=en_US.UTF-8` are exported — required for CocoaPods on macOS 26.

For local iOS builds (the new-Mac workflow):
```
rm -rf ios
npx expo prebuild --platform ios
open ios/playfastnotes.xcworkspace
# Xcode → pick iPad simulator → Play
```

## Platform-split file conventions

This is the **critical** structural pattern. Read it before you create or rename files.

**Default file gets `.ts` (or `.tsx`) — that's the NATIVE (iOS/Android) version.** Web override is `.web.ts` (or `.web.tsx`). Metro resolves the right one per platform at bundle time; TypeScript sees the `.ts` (native) version by default.

Examples in this repo:
- `lib/db/repos/folders.ts` (SQLite) + `lib/db/repos/folders.web.ts` (Supabase)
- `lib/db/client.ts` (SQLite client, iOS) — no `.web.ts` because nothing on web imports it
- `lib/startup/migrate.ts` (runs SQLite migrations) + `lib/startup/migrate.web.ts` (no-op)
- `lib/image/canvasCrop.ts` (ImageManipulator-based) + `.web.ts` (Canvas-based)
- `lib/image/persistPassageImage.ts` (writes to documents/pieces/) + `.web.ts` (uploads to Supabase Storage)
- `components/PassageRectDrawer.tsx` (gesture-handler) + `.web.tsx` (DOM pointer events)
- `components/PassageRectResizer.tsx` (gesture-handler) + `.web.tsx` (DOM)
- `components/SectionMarkerCapturer.tsx` (Pressable) + `.web.tsx` (`<div onClick>`)

**Important exception — `_layout.tsx` does NOT support platform suffixes.** expo-router 6 picks up both `_layout.tsx` AND `_layout.web.tsx` for web bundling, which breaks if either has native-only imports. So we use a **single** `_layout.tsx` with `Platform.OS` checks for the parts that diverge (web's auth gate, native's SQLite migrations). Any native-only code that the layout needs is reached through a platform-resolved helper (e.g. `lib/startup/migrate`), keeping `expo-sqlite` out of the web bundle.

**No moduleSuffixes in tsconfig.** I tried setting `moduleSuffixes: [".web", ".native", ".ios", ""]` early in the merge and it caused TS to pick up `.web.d.ts` files inside `node_modules/expo-file-system`, breaking type-checking of `expo-file-system`'s `File` class. Don't reintroduce it.

## Data layer

`lib/db/repos/*.ts` (native, SQLite) and `*.web.ts` (web, Supabase) have **identical exported function signatures and types**. When you add or modify a repo function, change both. The two implementations share nothing structurally — native uses `expo-sqlite`'s `db.runAsync`, web uses `supabase.from(...)`.

Supporting files (native-only): `lib/db/client.ts` (SQLite open + migrations), `lib/db/schema.ts` (MIGRATIONS array), `lib/db/seed.ts` (bundled JSON loader on first launch).

The Supabase client lives at `lib/supabase/client.ts` and is used by web's repo files. The merged iOS app does NOT use Supabase by default — it's only invoked by the optional `/import-supabase` dev route (one-shot pull from Supabase → SQLite).

Schema details:
- The SQL table is called `pieces` (Postgres on Supabase + SQLite on iOS). TypeScript symbols use `Passage` / `passages` (renamed in Phase 0 to match how musicians talk). `lib/db/repos/passages.ts` queries `FROM pieces` but exports `Passage` types. Don't rename the SQL identifiers.
- The `documents` table is the parent of multi-page PDF-backed passages. A passage with `document_id` non-null has its layout described by `regions_json: [{page, x, y, w, h}, ...]` in source-page pixels.

## Image cropping (cross-platform)

Single unified API in `lib/image/canvasCrop.{ts,web.ts}`:
- `cropImage(uri, rect): Promise<string>` — takes URI in, returns URI out (file:// on iOS, blob: on web)
- `stitchVerticallyUris(uris): Promise<string>` — multi-page composite. iOS currently throws for N>1 (TODO: react-native-view-shot integration)
- `displayToSource(...)`, `sourceToDisplay(...)` — pixel-space conversions

Then `lib/image/persistPassageImage.{ts,web.ts}` finalizes by either saving the file (native) or uploading to Supabase Storage (web) and returns the URI to store in `pieces.source_uri`.

The web file ALSO keeps the older Blob-based functions (`cropToBlob`, `cropImageToBlob`, `stitchVertically(blobs)`, `loadImage`) because `components/InlineCropper.tsx`, `app/multi-page.tsx`, and other web-only callers still use them directly. The native file stubs them with throws ("X is web-only; use cropImage on iOS").

## Live deploys

- **playfastnotes.com** — Vercel auto-deploys on push to `master` of `rdskiano/play-fast-notes-web`. **Cutover happened 2026-05-24** — this remote (`web-origin-archive`) is the live upstream. `git push web-origin-archive master` IS a deploy. Smoke-test the web bundle locally (`playweb` + click through every practice flow) before pushing anything risky.
- **Physical iPad** — still runs the dev client built from `learn-fast-notes/` via local Xcode. The merged repo's iOS build runs on the simulator and via EAS, but the user's working iPad hasn't been swapped over yet. iPad cutover is the next plumbing milestone.
- **EAS** — registered under slug `learn-fast-notes` and project ID `c2ba6a6f-d40c-4e17-a930-4ab813b5c870`. The merged repo's `app.json` keeps this slug to preserve the EAS identity. `playbuild` / `playpreview` builds come from this repo.

**Remaining cutover work (iPad):**
1. `playpreview` from this repo, install on the iPad over the existing learn-fast-notes build (same bundle id), verify all practice flows work on device.
2. Once verified, archive the `learn-fast-notes/` directory (rename to `learn-fast-notes-archive/` or move outside the COWORK tree).
3. The aliases in `~/.zshrc` (`playfast` / `playweb` / `playbuild` / `playpreview`) already point at this repo — no change needed.

## Active migration status

✅ **Done in 2026-05-19 session:**
- Merged repo created from web's codebase as the starting point.
- App.json + EAS config + package.json combined (web's web target + iPad's native plugins, deps superset).
- Both targets verified: web export and iOS xcodebuild both succeed.
- Data layer split into `.ts` (SQLite) + `.web.ts` (Supabase) for all 10 repo files plus `client`, `schema`, `seed`.
- `_layout.tsx` unified with platform-aware logic (web auth gate, native SQLite startup). `_layout.web.tsx` deleted (didn't work — expo-router bundles both).
- Platform splits for: `PassageRectDrawer`, `PassageRectResizer`, `SectionMarkerCapturer`.
- Image lib unified: `cropImage` / `stitchVerticallyUris` / `persistPassageImage` work on both platforms.
- `app/document/[id].tsx` updated to use the unified API — works on both.
- New helpers: `lib/startup/migrate.ts` (native) + `.web.ts` (no-op), `lib/sessions/lastPassageInDoc.ts`, `lib/image/persistPassageImage.{ts,web.ts}`.
- Native-only components copied from iPad: `InterleavedTimerContext.tsx`, `useInterleavedSession.ts`.
- All pure-RN components from web that were already used by iPad: `ActionSheet`, `ConfirmModal`, `PostSaveSheet`, `SectionsModal`, `PageBoxOverlay`.

⏳ **Still pending:**
- Web parity for `PencilCanvas.web.tsx` and `RecorderPanel.web.tsx`. Both are intentionally stubbed today (pencil = view-only PNG overlay; recorder = informational text). See "Upcoming: web parity work" below for the design rules.
- `RhythmBuilder` still uses the old `Floating*` controls (Tempo Ladder / Click-Up / Rhythmic / Interleaved have all been migrated to the `PracticeToolsLayer`).
- Cutover: GitHub remote, point Vercel + EAS at the merged repo, archive old repo dirs.

The metronome-silent-on-device blocker is **RESOLVED** (2026-05-20) — an illegal `defaultToSpeaker` iOS audio-session option paired with the `playback` category; fixed in `lib/audio/metronomeEngine.ts`. Full write-up in ROADMAP.md.

✅ **Added 2026-05-19 (second session):**
- **Multi-page passage stitching on iOS**: `react-native-view-shot` integration. New `components/StitchHost.tsx` exposes a hidden surface + `stitchOnHost(uris)` async function. Mounted once in `app/_layout.tsx` (native only). `lib/image/canvasCrop.ts` `stitchVerticallyUris` for N>1 delegates to `stitchOnHost`, preserving the same signature as web's Canvas-based stitcher so `app/document/[id].tsx` call sites are untouched. Web has a no-op `StitchHost.web.tsx`.
- **Metronome engine cross-platform split**: `lib/audio/useMetronome.ts` → `useMetronome.web.ts` (renamed). New native sibling `lib/audio/useMetronome.ts` wraps a new `lib/audio/metronomeEngine.ts` (ported from iPad's `lib/metronome/{useMetronome,engine}.ts`) that talks to `react-native-audio-api`. Both expose identical return shape (`Subdivision` re-exported from both). Dropped unused `setRunning` (web) and `playRhythm` (iPad-only). Native engine uses `TOKEN_QUARTER_FRACTIONS` from `lib/strategies/rhythmPatterns` as the unified source-of-truth for rhythm-token durations. Practice flows that import `useMetronome` (Tempo Ladder, Click-Up, Rhythmic, Exercise Builder, Serial Practice) now have a working audio path on iOS without code changes.
- **Render-time web-globals guards**: patched four pre-existing `window.*` / `document.*` calls in shared files. `app/passage/[id]/index.tsx` (keyboard arrow nav) + `app/passage/[id]/crop.tsx` + `components/InlineCropper.tsx` now early-return with `Platform.OS !== 'web'`. User-action-triggered web globals (alert/prompt/confirm, `new window.Image()`, `window.open`) are still unguarded.
- **`AbcStaffView` split native/web**: `AbcStaffView.tsx` → `.web.tsx` (the DOM + `document.head` abcjs CDN loader) plus a new native `AbcStaffView.tsx` that renders abcjs inside a `react-native-webview` (same approach as `RhythmNotation`). Same prop API on both — `abc`, `width`, `height`, `hideStaffLines`, `centered`, `scale`, `wrap`, `preferredMeasuresPerLine`, `fallbackText`, `onNoteTap` (WebView → RN `postMessage`), `activeNoteIndex` (live updates via `injectJavaScript`, no reload). This makes all standard notation render on iOS — subdivision chips, `PitchStaff`, `GroupingPicker`, the rhythmic + rhythm-builder staves.
- **`/import-supabase` route ported**: native data-import dev tool lives in the merged repo. `lib/supabase/client.ts` split (native is one-shot, `persistSession: false`; web is the existing config). `lib/supabase/import.ts` copied verbatim. `app/import-supabase.tsx` is the native UI; `app/import-supabase.web.tsx` is a placeholder explaining web is already Supabase-native. Route registered in `_layout.tsx`. Run via direct URL `/import-supabase` (no menu link). Toggle "Wipe local data first" to nuke SQLite + the app-sandbox `documents/` + `pieces/` directories before re-importing — the right play if local state is corrupt from a partial earlier import.
- **Native Floating practice controls + RhythmNotation + CropView**: `FloatingMetronome`, `FloatingClickUpControls`, `FloatingSlowClickUpControls`, `FloatingRhythmCard` all split into `.tsx` (native, gesture-handler + reanimated + `useDraggableCard`) + `.web.tsx` (the existing DOM pointer-event versions). `components/RhythmNotation.tsx` ported (WebView + abcjs CDN). `components/CropView.tsx` + `app/passage/[id]/crop.tsx` ported as `.tsx` siblings of the existing web `.web.tsx` flow. `lib/files/import.ts` added. Tempo Ladder / Click-Up / Rhythmic / Rhythm Builder render and operate on iOS — drag, scale, BPM, subdivisions, volume. (Metronome *audio* itself is silent on device/release builds — see the open blocker above.)
- **User-action web-globals guards**: `app/passage/[id]/rhythm-builder.tsx` PDF export now shows an explanatory `Alert.alert` on native instead of calling `window.open()`. `app/(tabs)/library.tsx` `confirmDelete` is now async and uses `Alert.alert` on native (previously auto-confirmed — accidental folder/passage deletes were a foot-gun on iPad). Remaining unfixed: `app/upload.tsx` and `app/document-upload.tsx` are still web-shaped (file picker + canvas), but they're not on the iPad-user's normal path (iPad imports via `/import-supabase` or document scanner). `app/document/[id].tsx` `window.alert/prompt` are already Platform-guarded → silent no-op on native (errors logged to console.warn; section names fall back to "Section N").

✅ **Added 2026-05-20 — Floating practice tools + metronome redesign** (committed `be6f60a`):
- **`components/ToolDock.tsx`** — an edge-docked tab; tapping it pops the tool out as a draggable, pinch-resizable card that flies home to the tab on collapse. `defaultOpen` starts it expanded.
- **`components/PracticeToolsLayer.tsx`** — the shared tool layer (left edge: Apple Pencil placeholder + Metronome; right edge: Timer + Tuner placeholder). Optional props: `metronome` (a practice strategy passes its own `useMetronome` instance so it drives the device), `metronomeNote` (a note shown on the metronome — also makes it open by default), `metronomeNext` (a strategy "next" action — replaces the metronome's tap-tempo with a green NEXT button).
- **`components/MetronomePanel.tsx`** — the metronome rebuilt as a fixed dark-graphite "device" (the `DEVICE` palette, theme-independent): recessed BPM readout, raised buttons, staircase `VolumeSlider`, tappable per-beat dots (grey = silent / orange = click / orange-with-">" = accent), tap-tempo, meter + subdivision pickers.
- **`components/NoteValueGlyph.tsx`** — note-value glyphs drawn natively from Views (no WebView / font) for the subdivision picker.
- **Engine** (`metronomeEngine.ts`): per-beat pattern + meter via `setBeatPattern`; `Subdivision` is now `1|2|3|4` (sixteenths added). Default pattern is uniform `['accent']` so callers that never set one are unchanged. `useMetronome` (native + web) gained `setBeatPattern` + a `MetronomeApi` type.
- **Mounted** on passage detail, document, and the **Tempo Ladder** + **Click-Up** practice screens. On the practice screens the strategy session's metronome drives the device; the standalone `PracticeTimersPill` was removed everywhere — it now lives only inside the Timer tool (`<PracticeTimersPill bare device={...}/>`).
- `FloatingMetronome` / `FloatingClickUpControls` / `FloatingSlowClickUpControls` are still imported by the not-yet-wired screens (Rhythmic / Interleaved / Rhythm Builder) — leave them until those screens are migrated.

⚠️ **Pre-existing TS errors that are NOT blockers:**
- `app/passage/[id]/self-led/[key].tsx(77,31)` and `app/passage/[id]/self-led/recording.tsx(193,31)` — `SelfLedKey` vs `Strategy` mismatch. Pre-existing in web's codebase; doesn't affect builds. Will likely resolve when we touch the self-led routes properly.

## ✅ Web parity + phone density + timer overhaul — SHIPPED 2026-05-23 → 2026-05-24

The "web parity work" plan from the previous version of this file is **done** — pushed live to playfastnotes.com on 2026-05-24 as commits `3d031c2` and `17767f6`. Highlights below; full per-feature notes in ROADMAP.md.

**Web parity:**
- `components/RecorderPanel.web.tsx` — real MediaRecorder + Web Audio meter + variable-speed playback + Supabase upload. Parity with the native expo-audio panel.
- `components/PencilCanvas.web.tsx` — `perfect-freehand` strokes with pressure, undo, composite-on-top of existing PNGs.
- `hooks/usePenDetected.web.ts` — listens for `pointerType === 'pen'` to reveal the Pencil tab only when a stylus is in use. `?pencil=1` URL override for testing. Native always returns true.
- `components/PedalCatcher.web.tsx` — BT foot pedals pair as keyboards, captured via `keydown`. Now always live during the playing phase (no toggle).
- Laptop UI: tab text no longer clipped (RN-Web rotated-text wrapper), page-nav corners no longer covered by tool tabs.

**Phone density (always at `min(width, height) < 600`):**
- `components/ZoomableImage.tsx` — pinch + pan + double-tap reset, with an in-memory **`persistKey`** so each passage remembers its own zoom across cycling (Interleaved was carrying the previous passage's zoom forward). Wired into every practice score: Click-Up, Tempo Ladder, Interleaved (both modes), Rhythmic, Chunking, Self-Led, Rhythm Builder, passage detail.
- All tool tabs collapse to icon-only on phone and stack on the right edge (clear of iPhone Dynamic Island / front camera).
- Tempo Ladder + Interleaved/Serial phone mode: SessionTopBar + bottom repBar hidden, replaced by floating dots pill + ✕ End top-left + ✗ Miss bottom-left + ✓ Clean bottom-right (56 px circles).
- Metronome card on phone hides note pill + TAP TEMPO + DRONE rows; Recorder card phone-mode goes to a compact pill with the meter inline.
- `app/_layout.tsx` mounts `SafeAreaProvider` so iPhone status bar stops overlapping every hand-rolled top bar.
- ⋯ ActionSheet menus for strategies + side actions on phone (passage detail, Document viewer, Click-Up).

**PWA + camera:**
- `app/+html.tsx` + `public/manifest.webmanifest` + 192/512 icons → "Add to Home Screen" on iOS works.
- `app/upload.tsx` + `app/multi-page.tsx`: drop zone redesign + `<input type="file" accept="image/*" capture="environment">` for direct camera capture on phones.

**Phone portrait polish (afternoon follow-up, commit `8cd4aa5`):**
- `components/InstallPrompt.web.tsx` + native no-op sibling — Add-to-Home-Screen coach modal that fires on every load when `min(w,h) < 600`, unless already in standalone mode or the user checked "Don't show this again." Mounted in BOTH auth branches of `app/_layout.tsx` so the public sign-in landing page (the friend-link surface) also coaches visitors. Detection details + the "don't consolidate the two mounts" rationale live in [[playfastnotes-install-prompt]].
- `app/+html.tsx` — added an inline `html, body, #root { height: 100dvh; }` that overrides expo-reset's `100%`. Without this, mobile Safari/Chrome size the layout against the *large* viewport (URL bar retracted), so the tool tabs and floating rep buttons get hidden under the browser's bottom toolbar. `dvh` adapts as the chrome shows/hides; browsers without `dvh` (Safari < 15.4 / Chrome < 108) ignore the line and keep the `100%` fallback.
- `app/(tabs)/library.tsx` — header + mode row stack into two rows on phone portrait so a long folder/repertoire name isn't ellipsized down to a few characters by the 5-button cluster on the right. Mode-segment text is now `textAlign: 'center'` everywhere so wrapped labels stay balanced.
- `components/PracticeToolsLayer.tsx` — metronome card on phone bumped to 240×280 (or 240×330 when a strategy supplies `metronomeNext`). The earlier 220×230 was clipping the bottom play row.
- `components/ToolDock.tsx` — the corner ⊖/⊕ sizer buttons are now hidden on any touch device (phone, iPad, Android tablet, etc.) via `matchMedia('(hover: none) and (pointer: coarse)')` plus a Platform-native short-circuit. Pinch is the native gesture there; the +/− pair was just stealing corner pixels from the tool. Laptops with a real mouse/trackpad still see the buttons; laptops with a touchscreen *and* trackpad correctly count as hover-capable and keep them too.
- `hooks/usePenDetected.web.ts` — the pencil tab now defaults visible on tablet (touch device with screen ≥ 600 px on the short side: iPad Safari, Surface, Android tablets). Phones and laptops still wait for a real `pointerType === 'pen'` event. The original "wait for proof" gating left iPad-Safari friend-link visitors not knowing the tool existed unless they happened to touch the screen with an Apple Pencil first.
- `components/ZoomableImage.tsx` — added zoom-out (`MIN_SCALE = 0.4`, was 1) so the user can shrink the score away from the floating ✓/✗ rep buttons that crowd the bottom corners. Snap-to-home only fires inside a ±0.05 window around 1× so a deliberate zoom-out isn't yanked back, and pan is gated on "not exactly 1×" so the shrunk score can be slid around inside the empty space.

**Timer overhaul:**
- New **Break** timer (`bodyMove`) — physical stand-up reminder, distinct from **Rotate** (was Move On) which just rotates passages.
- All four user-facing names are short labels: **Rotate / Micro / Cold / Break**. Internal config keys (`moveOn / microbreak / playItCold / bodyMove`) unchanged, so persisted prefs survive the rename.
- In-tool ⚙ Settings sheet (`TimerSettingsModal` in `components/GlobalTimerTray.tsx`) with enable + interval pickers per timer — no library round-trip required.
- Timer card recolored from blue to the metronome's charcoal `DEVICE` palette; off-state keys are warm off-white (`DEVICE.text`) so the emoji on each timer stays legible.
- Card resized to 360×132 so all six pill items (4 timer keys + ⚙ + ?) sit in one row on every device.

**Keyboard advance / "what next" UX:**
- `PedalCatcher.web.tsx` gained an optional `secondaryKey` + `onSecondary` so a single component covers both Click-Up (Space = NEXT) and Tempo Ladder / Interleaved (Space = Clean ✓, X = Miss ✗). Same 300 ms auto-repeat de-dupe + typing-target protection it always had.
- Pedal mode toggle removed entirely — the catcher is now always on during the playing phase, so foot pedals work without a mode switch.
- Bottom hint copy spells out the available shortcuts (laptop only — hidden on phone where there's no keyboard).

**ToolDock laptop affordances:**
- Corner ⊖ / ⊕ buttons (×1.15 per tap, clamped to `[MIN_SCALE, MAX_SCALE]` — same band the pinch uses) so mouse-only users can resize without pinch.
- Vertical drag clamp loosened to match horizontal (25% of the card can poke off any edge). The previous `minY: 4` made the Metronome card un-draggable upward.

**Self-Led:**
- Removed the Recording entry from `lib/strategies/selfLed.ts` since the Recorder is now a cross-cutting practice tool available on every screen. `/passage/[id]/self-led/recording` route stays in place so old practice-log rows still display correctly.

## ✅ Tempo Ladder Custom mode — SHIPPED 2026-05-24

Third mode added to Tempo Ladder (alongside Step click-up and Randomized cluster): **Custom**, a user-defined sequence of `count × tempo` blocks that runs as a click-up session. The motivating use case is the "9 + 1" pattern — 9 reps at base, 1 rep at base + 10, repeat — which is hard to drive yourself because you can't reliably surprise yourself with when the +10 rep lands.

**Architecture.** Saved Custom patterns live in a new per-user Supabase table `custom_patterns` and show up in the mode picker as peer cards alongside Step and Cluster. The user library follows the user across passages and devices.

**Plan doc lives at `TEMPO_LADDER_CUSTOM_PLAN.md`** — read it before extending the feature.

**Key files:**
- `lib/strategies/customPatterns.ts` — types (`CustomPattern`, `CustomBlock`, `TempoRef`) + helpers (`resolveBlockBpm`, `expandPatternToReps`, `summarizePattern`, `validatePattern`).
- `lib/supabase/customPatterns.ts` — per-user CRUD.
- `components/CustomPatternDots.tsx` — variable-size dot strip that encodes each rep's tempo as its radius (offset over base → up to 1.5× the smallest dot). Same component used in the editor preview and on the practice screen.
- `components/CustomPatternEditor.tsx` — modal sheet for build/edit with a live preview.
- `hooks/useTempoLadderSession.ts` — added Custom branch with `customBlockIndex` / `customRepInBlock` state and **strict miss-restart** (any miss resets position to block 0 / rep 0 immediately).
- `app/passage/[id]/tempo-ladder.tsx` — setup screen restructured: **mode picker at the top** as a card grid, then shared config (Base/Performance/Increment), then mode-specific extras. "Reps to advance" only shows for Step/Cluster; Custom shows the pattern preview + an Edit button.
- `db/schema.sql` + `lib/db/schema.ts` — new `custom_patterns` table + new columns on `tempo_ladder_progress` (`custom_pattern_id`, `custom_block_index`, `custom_rep_in_block`).

**One-time Supabase migration** (run in Supabase Studio SQL editor — already part of `db/schema.sql`):
```sql
create table if not exists custom_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  blocks jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_custom_patterns_user on custom_patterns(user_id, sort_order);
alter table custom_patterns enable row level security;
create policy custom_patterns_owner_all on custom_patterns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table tempo_ladder_progress drop constraint if exists tempo_ladder_progress_mode_check;
alter table tempo_ladder_progress add constraint tempo_ladder_progress_mode_check
  check (mode in ('step', 'cluster', 'custom'));
alter table tempo_ladder_progress add column if not exists custom_pattern_id uuid
  references custom_patterns(id) on delete set null;
alter table tempo_ladder_progress add column if not exists custom_block_index integer;
alter table tempo_ladder_progress add column if not exists custom_rep_in_block integer;
```

**Decisions captured in the conversation that built this:**
- **Tempos relative, not absolute.** Block tempos are `Base`, `Base + N`, `Performance`, or a literal BPM. Most patterns use relative refs because users care about relationships, not absolute numbers.
- **No "Reps to advance" in Custom.** The pattern itself is the success criterion — one clean run = one bump. Different from Step/Cluster, where N clean reps in a row triggers the advance.
- **Strict miss-restart.** A miss anywhere in the pattern returns the user to rep 1 of block 1 immediately. The user explicitly chose this over "finish the set anyway, but the set doesn't count."
- **Per-user library.** A saved pattern follows the user to every passage; it's not scoped per-passage.
- **Block tempos can exceed Performance.** That's overshoot training, intentional. No validation against this.
- **Variable-size dots.** Each rep's dot is sized by its tempo offset from base. The user sees the difficulty curve of their pattern at a glance before they play it.

## Where to pick up next

In rough priority order:

1. **Friend-test the live web build** at playfastnotes.com on a laptop, on a phone (PWA install), and on a tablet. The whole 2026-05-24 push is on master now; real-user smoke test is the only thing that catches the bugs Vercel/CI didn't.
2. **iPad cutover.** `playpreview` from this repo, install over the existing learn-fast-notes build, verify on the physical iPad. Then archive `../learn-fast-notes/`.
3. **Pre-existing TS errors in self-led routes** (`app/passage/[id]/self-led/[key].tsx`, `recording.tsx`) — `SelfLedKey` vs `Strategy` mismatch. Cheap cleanup next time we touch those files.
4. **Document viewer pinch-zoom** (intentionally deferred). The page image shares its coordinate space with `PageBoxOverlay` + draw/resize/draft surfaces, so wrapping in `ZoomableImage` would break the box-drawing math. Would need overlays scaled inside the transform too.
5. **Stripe + paid tier** (Phase 4.4.2 — the original cutover-then-monetize plan).
6. **Microbreak timer trigger wiring** — verify whether `microbreak.trigger()` is actually called by any practice flow (Tempo Ladder used to call it every N clean reps; check it survived the recent rework).
7. **Tuner placeholder removal** — `PracticeToolsLayer` no longer mounts a Tuner tool; verify no orphan references remain.

## Debugging the merged repo

This repo was built by porting the web codebase to *also* target native, which creates two recurring failure classes. When you hit either, fix the whole class — not just the one instance:

- **Latent web-only code.** DOM globals (`window`, `document`), raw HTML JSX (`<div>`, `<input>`), and browser-only APIs survive in files shared with native and crash on iOS. When one surfaces, grep the whole class at once and fix in a single pass — don't discover them one crash at a time.
- **Device/release-only bugs.** Some bugs appear only on a release or on-device build, never in the dev Simulator — Hermes compilation, TurboModule registration, iOS audio sessions, missing `EXPO_PUBLIC_*` env vars. Get real diagnostics *before* changing code (Console.app with the iPad tethered, or on-screen instrumentation in the app). Blind ~30-minute `playpreview` cycles to test a guess are a bad loop.

## Vocabulary: "passage" in TS, "pieces" in SQL

Phase 0 (2026-05-03) renamed `piece` → `passage` in TS / UI to match how musicians talk ("piece" = whole work; "passage" = section you drill). The SQL table stays `pieces`; FK columns stay `piece_id`. TS exports `Passage`, `passages`, `getPassage`, etc., but the SQL strings still read `from pieces`. Don't try to "fix" `piece_id` inside SQL identifiers.

## Don'ts

- **Don't edit `../learn-fast-notes/` or `../play-fast-notes-web/`** for new feature work. They're archives. The exception is keeping critical docs (CLAUDE.md/ROADMAP.md) in sync about the merge status.
- **`git push web-origin-archive master` is a live deploy.** Vercel ships it to playfastnotes.com within minutes. Smoke-test locally (`playweb`) first; the user is fine running the push themselves so the agent permission model doesn't get in the way.
- **Don't reintroduce `moduleSuffixes` in `tsconfig.json`.** It breaks `expo-file-system` resolution. The `.ts` / `.web.ts` pattern works without it.
- **Don't make `_layout.web.tsx`.** expo-router 6 bundles both that and `_layout.tsx` together. Use `Platform.OS` inside a single `_layout.tsx`.
- **Don't add native-only imports** to files that ship to web. If `lib/foo.ts` imports `expo-sqlite`, it must be only reached via the .ts (native) bundle. If a cross-platform file needs to call into SQLite, put the SQLite import in a `.ts` / `.web.ts` pair.
- **Don't break the `persistKey` contract on `ZoomableImage`.** Practice screens that cycle passages (Interleaved especially) rely on the per-passage transform cache; passing `undefined` means every passage inherits the previous one's zoom.
- **Don't gate the keyboard catcher behind a mode toggle.** `PedalCatcher` is supposed to be always live during the playing phase — the typing-target protection already prevents stray captures while the user is typing in a note prompt or BPM stepper.

## Reference

- Old repos' ROADMAP.md files for product direction history and vocabulary decisions (`../learn-fast-notes/ROADMAP.md` is the deepest).
- `~/Desktop/COWORK/PROJECTS/APPS/PlayFastNotes/Play Fast Notes — Reference/` — SOP, infographic, cheat sheet, iPad Build Runbook (the Runbook is iPad-specific; mostly still applies to the merged repo's iOS target).
