# Play Fast Notes — unified app (working notes for Claude)

This is **the unified Play Fast Notes codebase** — one Expo project that targets both **iOS (iPad)** and **web** from a single source tree. It supersedes the old split between `learn-fast-notes/` (iPad-only) and `play-fast-notes-web/` (web-only). Those repos still sit next door at `../learn-fast-notes/` and `../play-fast-notes-web/` as **read-only archives** — reference them when porting historical decisions, never edit them.

The user is **not a developer**. Always give them one-word terminal shortcuts (e.g. `playfast`, `playweb`), never long `cd ... && npx ...` lines that break on paste due to spaces in paths.

> **🔄 Status as of 2026-05-22.** The merge is **feature-complete for iOS** — both targets bundle, the data layer + practice UI are platform-split, and the merged app builds on EAS, installs, launches, and runs every practice flow on the physical iPad. All four practice tools shipped on iPad: **Metronome**, **Timer**, **Apple Pencil** (PencilKit, foot-pedal-driven), **Recorder** (expo-audio, replaces the original Tuner concept). See `ROADMAP.md` for the full shipping log. **Live deploys still come from the OLD repos until cutover** — playfastnotes.com runs the old web repo, physical iPad runs the old iPad repo. The merged app can be reviewed via Vercel preview URLs without cutover. **Current workstream (next session): web parity + responsive UI** — see "Upcoming: web parity work" below.

## Where this lives

- Working directory: `~/Desktop/COWORK/PROJECTS/APPS/PlayFastNotes/play-fast-notes/`
- Git: local-only for now. The web's GitHub remote was renamed `web-origin-archive` so accidental `git push origin` can't deploy to live. When ready to cut over, create a new GitHub repo named `play-fast-notes` (or rename the existing one) and point Vercel at it.
- Sibling layout:
  ```
  ~/Desktop/COWORK/PROJECTS/APPS/PlayFastNotes/
  ├── learn-fast-notes/        ← old iPad repo (read-only archive; physical iPad still runs this)
  ├── play-fast-notes-web/     ← old web repo (read-only archive; playfastnotes.com still deploys from this)
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

## Live deploys (still from the OLD repos as of 2026-05-19)

- **playfastnotes.com** — Vercel auto-deploys on push to `master` of `rdskiano/play-fast-notes-web`. The merged repo's git remote was deliberately renamed `web-origin-archive` so it can't accidentally push there yet.
- **Physical iPad** — runs the dev client built from `learn-fast-notes/` via local Xcode. The merged repo's iOS build only runs on the **simulator** so far.
- **EAS** — registered under slug `learn-fast-notes` and project ID `c2ba6a6f-d40c-4e17-a930-4ab813b5c870`. The merged repo's `app.json` keeps this slug to preserve the EAS identity. When the merged repo eventually ships, EAS builds will use this same project.

**Cutover plan** (not done yet — see ROADMAP):
1. Create a new GitHub repo (or rename the existing `play-fast-notes-web` to `play-fast-notes`) and add it as the remote.
2. Push the merged repo as `master`.
3. Point Vercel at the new repo / new branch.
4. Verify the web build passes from the new source.
5. EAS automatically picks up the new repo because it's all `eas.json` + local source. Local builds in Xcode from the new dir work without coordination.
6. Update the four aliases in `~/.zshrc` to point at the merged dir if not already.
7. Archive the old repos (rename dirs to `learn-fast-notes-archive/` etc., or move outside the COWORK tree).

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

## Upcoming: web parity work (planned 2026-05-22)

The merged repo's web bundle has all the cross-platform features (strategies, practice loops, metronome, score viewing, data layer) but two tools are intentionally crippled on web: `PencilCanvas.web.tsx` is view-only, `RecorderPanel.web.tsx` is informational text. Plus the responsive layer was tuned for tablet sizes — laptop and phone viewports have visible UI bugs (broken tab text, missing page nav). The next workstream brings these to parity.

**Design rules for this work** (decided 2026-05-22):

- **Don't ask users to pick their device.** Use viewport size + `PointerEvent.pointerType` for capability detection. Pickers create friction before value and people pick wrong on hybrid devices.
- **Pencil is a stylus-surface feature, not a cross-surface one.** Build a real web `PencilCanvas` (Pointer Events with pressure, e.g. `perfect-freehand`, output PNG to match the iOS PencilKit format) but hide the pencil tab on initial load. Reveal it the first time any pointer event fires with `pointerType === 'pen'`. Apple Pencil in iPad Safari, Surface pens, and Android stylus tablets all fire this. Mouse-only and finger-only surfaces never see the tab. The existing view-only display of saved markup stays everywhere — that part of `PencilCanvas.web.tsx` is correct.
- **Recorder is cross-surface.** Every device has a usable mic. The native `RecorderPanel.tsx` already uses `expo-audio` which supports web (wraps MediaRecorder). The legacy `app/passage/[id]/self-led/recording.tsx` already proves MediaRecorder works for this app's recording needs. Build the web Recorder for parity with the native one (meter, variable-speed playback, save takes to practice log).
- **Phone is score-first.** The `ToolDock` / `PracticeToolsLayer` architecture is already shaped right for phone: tools live as edge tabs and pop out as draggable cards above the score. What changes on phone is density (icon-only tabs under ~600px viewport) and defaults (all tools collapsed at first open; app nav bar auto-hides during practice screens).
- **PWA mode for phone.** Add a Web App Manifest + iOS meta tags so users can "Add to Home Screen" and run the app full-screen without browser chrome. Pure config, not architecture.
- **Camera capture entry point.** For the in-lesson snap-a-passage workflow, add an `<input type="file" accept="image/*" capture="environment">` affordance near `app/upload.tsx` to open the rear camera directly on phones.

**Sequenced order** (gates earlier steps before later ones):

1. Fix laptop UI bugs (tab text, page nav). Small, unblocks laptop evaluation, surfaces how the responsive layer is currently wired.
2. Build web recorder.
3. Build web pencil (stylus-gated).
4. Phone density pass + PWA + camera capture.
5. Friend-test all three surfaces via Vercel preview (web) and TestFlight (iPad).
6. Cutover live deploys.
7. Stripe + paid tier (Phase 4.4.2).

## Debugging the merged repo

This repo was built by porting the web codebase to *also* target native, which creates two recurring failure classes. When you hit either, fix the whole class — not just the one instance:

- **Latent web-only code.** DOM globals (`window`, `document`), raw HTML JSX (`<div>`, `<input>`), and browser-only APIs survive in files shared with native and crash on iOS. When one surfaces, grep the whole class at once and fix in a single pass — don't discover them one crash at a time.
- **Device/release-only bugs.** Some bugs appear only on a release or on-device build, never in the dev Simulator — Hermes compilation, TurboModule registration, iOS audio sessions, missing `EXPO_PUBLIC_*` env vars. Get real diagnostics *before* changing code (Console.app with the iPad tethered, or on-screen instrumentation in the app). Blind ~30-minute `playpreview` cycles to test a guess are a bad loop.

## Vocabulary: "passage" in TS, "pieces" in SQL

Phase 0 (2026-05-03) renamed `piece` → `passage` in TS / UI to match how musicians talk ("piece" = whole work; "passage" = section you drill). The SQL table stays `pieces`; FK columns stay `piece_id`. TS exports `Passage`, `passages`, `getPassage`, etc., but the SQL strings still read `from pieces`. Don't try to "fix" `piece_id` inside SQL identifiers.

## Don'ts

- **Don't edit `../learn-fast-notes/` or `../play-fast-notes-web/`** for new feature work. They're archives. The exception is keeping critical docs (CLAUDE.md/ROADMAP.md) in sync about the merge status.
- **Don't `git push` from this repo until cutover.** The remote is `web-origin-archive` precisely so an accidental push hits the archive, not live web.
- **Don't reintroduce `moduleSuffixes` in `tsconfig.json`.** It breaks `expo-file-system` resolution. The `.ts` / `.web.ts` pattern works without it.
- **Don't make `_layout.web.tsx`.** expo-router 6 bundles both that and `_layout.tsx` together. Use `Platform.OS` inside a single `_layout.tsx`.
- **Don't add native-only imports** to files that ship to web. If `lib/foo.ts` imports `expo-sqlite`, it must be only reached via the .ts (native) bundle. If a cross-platform file needs to call into SQLite, put the SQLite import in a `.ts` / `.web.ts` pair.

## Reference

- Old repos' ROADMAP.md files for product direction history and vocabulary decisions (`../learn-fast-notes/ROADMAP.md` is the deepest).
- `~/Desktop/COWORK/PROJECTS/APPS/PlayFastNotes/Play Fast Notes — Reference/` — SOP, infographic, cheat sheet, iPad Build Runbook (the Runbook is iPad-specific; mostly still applies to the merged repo's iOS target).
