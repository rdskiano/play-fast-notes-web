# Play Fast Notes — Roadmap (unified)

_Last updated: 2026-05-24_

This roadmap covers **both surfaces** (iOS/iPad + web) of the unified Play Fast Notes app, which lives in this directory (`play-fast-notes/`). The two older repos (`../learn-fast-notes/` for iPad and `../play-fast-notes-web/` for web) are read-only archives and their roadmaps are historical only.

> **🚀 2026-05-24 — WEB CUTOVER COMPLETE.** `playfastnotes.com` now ships from THIS repo via `git push web-origin-archive master` (the remote alias still has the "archive" word, but it points at `rdskiano/play-fast-notes-web` and Vercel auto-deploys from there). The 2026-05-23/24 push (`3d031c2` + `17767f6`) shipped: web Recorder + web Pencil (stylus-gated) + PWA + camera capture + phone density pass + per-passage pinch-zoom + timer overhaul (4 timers Rotate/Micro/Cold/Break + ⚙ settings sheet) + Space/X keyboard advance + ToolDock −/+ resize. **iPad cutover is the remaining plumbing milestone** — the physical iPad still runs Xcode-built dev clients from `learn-fast-notes/`.

The old web-only context note (2026-05-17 Mac upgrade) is now folded into history. iPad still uses local Xcode builds for the user's working device; web now ships from this repo via Vercel.

## Unified-codebase migration (active 2026-05-19)

**Why:** Web and iPad were duplicating effort. Every UI feature implemented twice in different paradigms (DOM events vs RN gestures, browser Canvas vs ImageManipulator, etc.). Drift was constant.

**Approach:** Single Expo project. Web is the bundle target for `expo export -p web`; iOS/Android is the bundle target for native builds. Platform divergence handled via Metro's file-extension resolution: `.ts` = native default, `.web.ts` = web override. See CLAUDE.md "Platform-split file conventions" for the rules.

**Done (2026-05-19):**
- Merged repo created from web's codebase as the base.
- `app.json` + `eas.json` + `package.json` merged (web target + iPad's native plugins + deps superset).
- Both targets verified: web export passes (29 routes), iOS `xcodebuild` passes.
- Data layer split — `lib/db/repos/*.ts` (SQLite) + `*.web.ts` (Supabase), plus `lib/db/client.ts` / `schema.ts` / `seed.ts` (native-only).
- Unified `_layout.tsx` with `Platform.OS` gates (web auth, native SQLite migrations). `_layout.web.tsx` deleted — expo-router 6 doesn't honor platform suffixes for layouts.
- `lib/startup/migrate.{ts,web.ts}` — native runs migrations + seed, web no-op.
- Image lib unified: `cropImage(uri, rect)` + `stitchVerticallyUris(uris)` + `persistPassageImage(passageId, uri)` work on both surfaces (native uses ImageManipulator → local file; web uses Canvas → Supabase Storage).
- Component splits for the document-marker UI: `PassageRectDrawer.{tsx,web.tsx}`, `PassageRectResizer.{tsx,web.tsx}`, `SectionMarkerCapturer.{tsx,web.tsx}`.
- `app/document/[id].tsx` rewritten to use the unified image API — works identically on both targets.
- Pure-RN components from web already on iPad: `ActionSheet`, `ConfirmModal`, `PostSaveSheet`, `SectionsModal`, `PageBoxOverlay` (all single `.tsx`, no platform split needed).
- Native-only deps from iPad copied in: `InterleavedTimerContext.tsx`, `useInterleavedSession.ts`.
- **Multi-page passage stitching on iOS** (2026-05-19): `react-native-view-shot` integration via a module-level `<StitchHost />` mounted in `_layout.tsx`. `stitchVerticallyUris(uris)` for N>1 now renders the source images stacked into a hidden off-screen `<View>`, waits for all `Image` children to fire `onLoadEnd`, then `captureRef` flattens to a JPEG. Call site `app/document/[id].tsx` unchanged — same `stitchVerticallyUris(uris) → Promise<string>` signature as the Canvas-based web implementation. Web shim renders nothing (`components/StitchHost.web.tsx`).
- **Metronome engine cross-platform split** (2026-05-19): `lib/audio/useMetronome.ts` → `useMetronome.web.ts` (rename). New native sibling `lib/audio/useMetronome.ts` wraps a new `lib/audio/metronomeEngine.ts` (ported from iPad's `lib/metronome/{useMetronome,engine}.ts`) that talks to `react-native-audio-api`. Both implementations expose identical return shape: `{ bpm, subdivision, running, volume, rhythmLooping, playingSequence }` plus `setBpm`, `setSubdivision`, `setVolume`, `start`, `stop`, `toggle`, `startRhythmLoop`, `stopRhythmLoop`, `toggleRhythmLoop`, `playPitch`, `playPitchSequence`, `playPitchRhythm`, `stopPitchSequence`. `Subdivision` re-exported from both. Dropped `setRunning` (no consumer) and `playRhythm` (iPad-only, no consumer). Native engine uses `TOKEN_QUARTER_FRACTIONS` from `lib/strategies/rhythmPatterns` as the unified source-of-truth for rhythm-token durations. iPad practice-flow consumers (Tempo Ladder / Click-Up / Rhythmic / Exercise Builder / Serial Practice) now have a working metronome on iOS without requiring code changes.
- **Render-time web-globals guards** (2026-05-19): patched four pre-existing `window.*` / `document.*` calls in shared files that the merged repo inherited from web's codebase: `app/passage/[id]/index.tsx` (keyboard arrow nav), `app/passage/[id]/crop.tsx` + `components/InlineCropper.tsx` (window resize listeners). User-action-triggered web globals (alert/prompt/confirm, new Image, window.open) are still unguarded — tracked as a follow-up.
- **`AbcStaffView` native port** (2026-05-19): split into `.web.tsx` (the original DOM + abcjs-CDN-script renderer) and a new native `.tsx` that renders abcjs inside a `react-native-webview` — same prop API, including `onNoteTap` (WebView→RN postMessage) and `activeNoteIndex` (live `injectJavaScript`, no reload). All standard notation now renders on iOS (subdivision chips, PitchStaff, GroupingPicker, rhythmic + rhythm-builder staves). Earlier it had been stubbed to return `null` on native as a crash-stop.
- **`/import-supabase` route ported** (2026-05-19): the iPad-only data-import dev tool now lives in the merged repo. `lib/supabase/client.ts` split into `.ts` (native, `persistSession: false` one-shot) and `.web.ts` (the existing web config). `lib/supabase/import.ts` copied verbatim from the archive. `app/import-supabase.tsx` is the native UI; `app/import-supabase.web.tsx` is a placeholder that explains web is already Supabase-native. Route registered in `_layout.tsx`. Lets the user wipe and re-populate the iPad's local SQLite from their live Supabase data — including downloading PDF page renders to the app sandbox.

- **Native Floating practice controls + RhythmNotation + CropView** (2026-05-19): all four native `Floating*` components ported as real native implementations (gesture-handler + reanimated + `useDraggableCard` + `useResponsiveCardWidth` hooks). `RhythmNotation` (WebView + abcjs) ported as a sibling of `AbcStaffView`. `CropView` ported, plus the iPad's `app/passage/[id]/crop.tsx` flow (re-crop with restore-original + crop-another paths) plus `lib/files/import.ts`. Tempo Ladder / Click-Up / Rhythmic / Rhythm Builder all render fully on iOS. (Subdivision chips render correctly once the `AbcStaffView` native port lands — see below.) `InlineMetronome` / `NoteCardStrip` / `PreviewPlayButton` / `SubdivisionControls` from the original list confirmed as orphans in the iPad archive — zero importers — and skipped.

- **EAS preview build + device-launch fixes** (2026-05-19): the merged repo's first `playpreview` surfaced three release-build-only bugs, all fixed. (1) **Hermes build failure** — `@supabase/supabase-js@2.106.0` added an OpenTelemetry dynamic `import()` that Hermes can't compile; pinned to `~2.104.1` (pre-otel, matches the deployed web repo). Also corrected `expo-document-picker` from a stray `55.x` to the SDK-54 `~14.0.8` and added `expo-asset@~12.0.13`. (2) **Instant launch crash** — `EXPO_PUBLIC_SUPABASE_*` env vars lived only in gitignored `.env.local`, so the EAS build never got them and the Supabase client threw at module load; added a committed `.env` and hardened the native client to not throw. (3) **Volume control** — `@react-native-community/slider` ignores its `value` prop on iOS New-Arch; replaced with a 5-step segmented `VolumeSlider`, plus a 2× engine gain. After these, the preview build installs + launches on the iPad and notation renders.

**✅ RESOLVED 2026-05-20 — metronome audio silent on device.**
Root cause: `lib/audio/metronomeEngine.ts` configured the iOS audio session as `iosCategory: 'playback'` **with** `iosOptions: ['defaultToSpeaker', 'mixWithOthers']`. `defaultToSpeaker` is only legal with the `playAndRecord` category — pairing it with `playback` makes `AVAudioSession.setActive(true)` fail on a physical device (`SessionActivationError`), leaving the `AudioContext` stuck in `suspended` with a frozen clock, so every click was scheduled into a dead timeline. The Simulator silently tolerates the bad option — that's why it was device-only. **Fix:** drop `defaultToSpeaker` from `iosOptions`. Diagnosed by adding temporary `[METRO-DIAG]` console instrumentation to the engine and reading it off a Debug build over Metro on the tethered iPad — no slow `playpreview` cycles. Verified clicking on the physical iPad.

**✅ 2026-05-20 — Floating practice tools + metronome redesign** (committed `be6f60a`). Replaced the per-strategy floating control cards with a shared edge-docked tool system, and rebuilt the metronome as a "device." Verified on the physical iPad.
- `components/ToolDock.tsx` — an edge-docked tab that pops a tool out as a draggable, pinch-resizable card and flies it home to the tab on collapse. `defaultOpen` starts it expanded.
- `components/PracticeToolsLayer.tsx` — mounts the tools (left edge: Apple Pencil placeholder + Metronome; right edge: Timer + Tuner placeholder). Props: optional `metronome` (a practice strategy hands in its own `useMetronome` instance so it can drive the device), `metronomeNote` (explanatory note shown on the metronome — its presence also opens the metronome by default), `metronomeNext` (a strategy "next" action — turns the metronome's tap-tempo button into a green NEXT).
- `components/MetronomePanel.tsx` — the metronome as a fixed dark-graphite "device" (`DEVICE` palette): recessed BPM readout, raised buttons, staircase `VolumeSlider`, a row of tappable per-beat dots (grey = silent / orange = click / orange-with-">" = accented), tap-for-tempo, meter + subdivision pop-up pickers.
- `components/NoteValueGlyph.tsx` — small note glyphs (heads + stems + beams) drawn natively with Views (no WebView/font dep) for the subdivision picker.
- Engine (`metronomeEngine.ts`): per-beat pattern (`accent | normal | mute`) + meter via `setBeatPattern`; `Subdivision` extended to `1|2|3|4` (adds sixteenths). Default pattern stays uniform `['accent']`, so practice callers that never set one are unchanged. `useMetronome` (native + web) gained `setBeatPattern` and exports a `MetronomeApi` type. Meter logic in `MetronomePanel`: simple x/4 → quarter/2-eighths/triplet/4-sixteenths; compound x/8 (÷3) → dotted-quarter / 3-eighths; odd x/8 (5/8) → eighth-pulse beats.
- Mounted on the **passage detail** + **document** screens, and the **Tempo Ladder** + **Click-Up** practice screens. On the practice screens the strategy session drives the metronome (BPM tracks the ladder / steps); the metronome opens by default with a note. Tempo Ladder's Clean/Miss are now top-bar buttons; Click-Up's "Next" is the green button on the metronome.
- The standalone practice-timers pill was removed from every screen — `PracticeTimersPill` now lives only inside the Timer tool (`<PracticeTimersPill bare device={...}/>`, styled as a blue device).

**✅ 2026-05-21 — Apple Pencil annotation + Bluetooth foot pedal** (the native rebuild flagged in the 2026-05-20 "pending tools" note). Both needed new native modules; shipped in two EAS dev builds — `25fe3d10` (pedal), `e535c173` (pencil).
- **Foot pedal "next" capture.** A Bluetooth page-turner pedal (AirTurn-style, configured for forScore) pairs as a BT keyboard and sends arrow keys. Captured by a hand-written local Expo module `modules/hardware-keys` — `KeyCaptureView` uses `GCKeyboard` (Apple's GameController framework, HID-level). `react-native-key-command` failed (legacy `RCTEventEmitter`, doesn't register under the New Architecture); `pressesBegan` / `UIKeyCommand` failed (first-responder-dependent — iPadOS's focus system eats the arrows). Wired into Click-Up behind a "PEDAL" toggle.
- **Apple Pencil score annotation** (`react-native-pencil-kit`, PencilKit). Annotate the score with the Pencil on the passage screen, every practice strategy, and per-page on the PDF/document viewer. **One shared set of marks:** a passage cropped from a PDF shares that PDF page's annotation, so a mark drawn while practicing shows on the PDF and on every passage from that page. Storage is **Supabase-only on both platforms** — `pieces.annotation_data` + `annotation_image_uri` for standalone passages, a new `document_annotations` table for PDF pages. The iPad now persists a Supabase session (annotation writes to Supabase live). A `patch-package` patch makes the PencilKit canvas transparent. The annotation canvas is pinned to the page's native pixel size (`RegionAnnotationCanvas`) so marks don't drift across screens / orientations — `PKDrawing` stores absolute coordinates. Pending the user's on-device verification of the final coordinate-drift fix (commit `bca69ca`).
- **Still open:** a "pinch to resize" hint on the practice score; the same native-pixel pinning for standalone (non-PDF) passages; pinch-to-zoom in the rhythm builder + ICU marker placement.

**✅ 2026-05-22 — Recorder tool + browse-and-pick passage selection + recordings in the iPad practice log.** A long session of work; needs a `playpreview` (or a web cutover) for end-to-end device verification.
- **Recorder tool** (replaces the Tuner tab). Native `components/RecorderPanel.tsx` (`expo-audio`): record with a live input meter, pitch-corrected variable-speed playback (1× / 0.75× / 0.5×), save takes to the current passage's — or the PDF's — practice log. iOS doesn't let apps lower the built-in mic's input level (`AVAudioSession.isInputGainSettable` is false, and `expo-audio` exposes no input gain), so the meter is the "don't clip" affordance — not a slider. `setAudioModeAsync({ allowsRecording: true })` only around `record()`. Web is a placeholder; recording is the iPad's job. Takes live for the screen session.
- **Document-level recordings.** Supabase migration `practice_log_document_recordings`: `practice_log.piece_id` made nullable + new nullable `document_id text` column. Recordings made on the PDF viewer log under the PDF instead of needing a passage. `lib/supabase/recordings.ts` `saveRecording(target, fileUri, durationSec)` where `target = {passageId} | {documentId}`.
- **Recordings in the iPad practice log.** Recordings live only in Supabase (file + `practice_log` row), so the web app sees them — but the iPad's local SQLite log never has them. New `lib/supabase/recordingLog.ts` `getAllRecordingEntries()` fetches them straight from Supabase and resolves titles (the iPad's SQLite is empty/test, so titles MUST come from Supabase). Merged into all four native `practiceLog.ts` queries (`getPracticeLogForPassage / Document / Library / Folder`). Returns `[]` on error so the local log still renders.
- **`RecordingPlayer` native.** The shared practice-log player was web-only (`<audio controls>`, `return null` on native). Split into `.web.tsx` (HTML audio) + `.tsx` (`expo-audio` player: play/pause + progress + time). New `.m4a` recordings play; older web-uploaded `.webm` ones can't be decoded by iOS.
- **The 0-byte upload bug.** `saveRecording` initially used `fetch(fileUri).then(r => r.blob())` — in React Native that returns a **zero-length blob**, so every recording uploaded as a 0-byte `.m4a` (visible in the log, silent on playback). Fix: `await new File(fileUri).bytes()` (`expo-file-system`) and upload the `Uint8Array`. Added a `bytes.length === 0` guard so a genuinely-silent capture surfaces "Recording is empty" instead of an invisible 0-byte save. This RN footgun is now in memory ([[rn-fetch-blob-zero]]).
- **Recording duration**. `recState.durationMillis` reports 0 on stop; switched to a wall-clock `recordStartRef = Date.now()` at record + `Date.now() - recordStartRef` at stop. Also drives the live elapsed display via the metering re-render tick.
- **Auto-collapse tool cards on screen blur.** `PracticeToolsLayer` bumps a `resetKey` via `useFocusEffect`'s cleanup → every `ToolDock` (and the `RecorderPanel` inside) remounts collapsed on blur. Tapping a passage from the PDF and coming back no longer leaves the recorder popped open with stale takes (or an in-progress recording).
- **Forward-navigation flush for annotations.** `beforeRemove` only fires on pop/replace; a `push` left the save racing the next screen's fetch. `useScoreAnnotation` / `useDocumentAnnotation` expose `flush()`; passage and document screens `await ann.flush()` before any `router.push`. Plus a 2.5s idle auto-save after the last stroke (driven by `react-native-pencil-kit`'s `onCanvasViewDrawingDidChange`). And the PencilKit picker now opens with the `'pencil'` tool pre-selected (`setTool({toolType:'pencil'})`).
- **Browse-and-pick passage selection.** Serial Practice's select phase rebuilt as `components/PassagePicker.tsx` — a library browser. Folders / PDFs / loose passages; drill in with `‹ Back` (`‹ Choose more passages` inside a PDF). Opening a PDF renders its pages at native aspect with the passage boxes overlaid — tap a box to check it. Each folder/PDF row shows a blue badge with the count of currently-selected passages inside (folder count is recursive). One screen with an internal view stack — no extra route, no store; selection lives in `interleaved.tsx`. Solves the "Completed folder clutters the picker" problem because you only see what you drill into.
- **Interleaved consistency-mode tools.** `app/interleaved.tsx` now mounts `PracticeToolsLayer` like Tempo Ladder / Click-Up, and **per-spot tempo memory** is restored — when a passage cycles back through the rotation, the metronome snaps to the BPM you last used on it. (Was lost in the merge; ported back from the iPad archive: `tempoMap` ref + `saveCurrentTempo()` on Clean/Miss + restore-on-`currentIndex` effect.)
- **Uniform graphite tool tabs.** All four tabs (Pencil, Metronome, Timer, Recorder) use `DEVICE.body`. Cards keep their own palettes (timer card still blue, etc.); only the docked tab strips are uniform. (User found the bright-red Recorder tab "stressful.")
- **Help-menu copy.** The Library `?` menu's "Serial Practice" description dropped the removed timer option ("fixed amount of time or a fixed number of repetitions" → "a fixed number of clean repetitions").
- **Open follow-ups**: this entire session is JS-only (no native rebuild required — `expo-audio`, `expo-file-system`, and the mic permission were already in the EAS dev build), but recording, audio session, and practice-log display are device-only behavior — the existing 0-byte recordings in storage are dead and should be cleaned up by the user; PDF-viewer recordings still need a hands-on smoke test; scrubbing on the practice-log player would be nice (currently play/pause only).

**Pending — practice screens still on the old `Floating*` controls:** Rhythm Builder (its `right: ['timer', 'metronome', 'pencil']` override means no Recorder there yet) — minor. Rhythmic, Interleaved are wired. Tempo Ladder / Click-Up have been wired since 2026-05-20.

**Pending — tools still placeholders:** none. Tuner was retired in favor of the Recorder; Apple Pencil annotation, the foot pedal, the Metronome, the Timer, and the Recorder all ship. A real Tuner (live pitch detection) can come back later as a separate tool if needed.

**Known rough edge:** the metronome/timer cards use fixed `panelHeight` numbers; content changes need a manual height nudge. Could make `ToolDock` auto-size to content.

**Pending — web verify + cutover:**
- Re-verify the web build — `npx expo export -p web` — not re-checked since the 2026-05-20 floating-tools work (which touches shared components that also bundle for web).
- Smoke-test web practice flows locally (`playweb`).
- Cutover: create a GitHub remote, push, point Vercel at the merged repo, archive the old dirs. The `~/.zshrc` aliases (`playfast`/`playweb`/`playbuild`/`playpreview`) already point at the merged repo. Web is the deployed, battle-tested surface — stage the web and iOS cutovers separately.

**Pre-existing TS errors that are NOT blockers** (carried in from web's codebase):
- `app/passage/[id]/self-led/[key].tsx(81,31)` and `app/passage/[id]/self-led/recording.tsx(197,31)` — `SelfLedKey` vs `Strategy` mismatch. Doesn't break builds.

**✅ 2026-05-23 → 2026-05-24 — Web parity, phone density, timer overhaul, keyboard advance.** Shipped live to playfastnotes.com on 2026-05-24 as commits `3d031c2` (the big push, 51 files / +4025/-729) and `17767f6` (keyboard + ToolDock follow-up). This closes out the entire "Upcoming: web parity work" plan from the prior version of CLAUDE.md.

**Web parity (Steps 2–3 of that plan):**
- **Web Recorder.** `components/RecorderPanel.web.tsx` rewritten from informational text to real MediaRecorder + Web Audio AnalyserNode meter + `HTMLAudioElement#preservesPitch` variable-speed playback (1× / 0.75× / 0.5×) + Supabase upload via `saveRecording`. Parity with the native expo-audio panel. `lib/supabase/recordings.ts` `saveRecording` now accepts `string | Blob`.
- **Web Pencil (stylus-gated).** `components/PencilCanvas.web.tsx` rewritten as a real edit canvas — `perfect-freehand` strokes with pressure (added the dep), Pointer Events, undo (button + Cmd/Ctrl+Z), composite-on-top of existing PNG annotations. Tab is hidden by default; revealed first time any pointer event fires with `pointerType === 'pen'` — Apple Pencil in iPad Safari, Surface, Android stylus all fire this. New `hooks/usePenDetected.{ts,web.ts}` (native always returns true; web persists detected state in localStorage). `?pencil=1` URL override for testing. **Bug fix mid-session:** marks were being lost on a second edit because the `[imageUri]` cleanup effect cleared `bgImgRef`, racing the DONE capture against an empty canvas. Fix: don't clear `bgImgRef` in cleanup; add `bgPendingRef` to block draws while a new background loads. `components/AnnotationCanvas.tsx` gained a ResizeObserver fallback because RN-Web's `onLayout` reports 0×0 for absolute-fill Views.
- **Web foot pedal.** `components/PedalCatcher.web.tsx` listens for `keydown` on `window` (Bluetooth pedals pair as keyboards and emit arrows / PageUp/Down / Space / Enter). Same 300 ms auto-repeat de-dupe as the native sibling. Typing-target protection (input / textarea / contentEditable).
- **Laptop UI fixes.** `components/ToolDock.tsx` tab text wrapped in an absolutely-positioned wrapper sized to the rotated footprint so RN-Web stops clipping "METRONOME" / "RECORDER" to 34 px. Page-nav chevrons moved to top corners on the Document viewer so they're not covered by tool tabs.

**Phone density pass (Step 4 of that plan) — `min(width, height) < 600`:**
- `components/ZoomableImage.tsx` — pinch + pan + double-tap reset, built on gesture-handler (same pattern as ToolDock). Accepts `uri` OR `children` (e.g. wrap a `ScoreWithMarkers` so the ▼ markers ride along the transform — used in Click-Up). Gained an in-memory **`persistKey`** so cycling between passages in Interleaved doesn't carry the previous passage's zoom forward. Module-level `Map<string, {scale, tx, ty}>` keyed by `passage.id`; on key change save outgoing, load incoming. Wired into every practice score: Click-Up, Tempo Ladder, Interleaved (both modes), Rhythmic, Chunking, Self-Led generic + recording, Rhythm Builder, passage detail. Document viewer is intentionally deferred — its page image shares its coordinate space with `PageBoxOverlay` + draw/resize/draft surfaces, so wrapping in ZoomableImage would break the box-drawing math.
- All tool tabs collapse to icon-only square tabs on phone (`tabSpan(key, isPhone)` returns `TAB_THICKNESS`). `PHONE_LAYOUT` stacks every tool on the RIGHT edge so the iPhone Dynamic Island / front camera (left side in landscape) can't cover a tab. Metronome takes the top slot.
- Tempo Ladder + Interleaved/Serial consistency-mode phone layout: `SessionTopBar` and the bottom rep-bar are hidden, replaced by — floating **dots pill** at top center (streak indicators + `n/N` complete on Interleaved) — `✕ End` 36 px circle top-left — `✗ Miss` 56 px red circle bottom-left — `✓ Clean` 56 px green circle bottom-right. Score gets `paddingBottom: insets.bottom + 40` so the rep circles sit in their own band.
- `MetronomePanel` on phone hides the instructional note pill + TAP TEMPO + DRONE MET row (saves a row of vertical height). Card sized 220×230 on phone vs 280×312 (or 280×384 with a note) on tablet.
- `RecorderPanel.web` on phone: compact record button inline with the meter, hidden "Playback speed" label + "Input level" caption + bottom hint, tighter padding. Card 240×290 on phone vs 300×430 on tablet.
- `app/_layout.tsx` mounts `SafeAreaProvider` at root so `useSafeAreaInsets()` returns real values on iPhone — every hand-rolled top bar now pads `insets.top` to clear the status bar.
- Phone-density passes on Library, Document viewer, passage detail (⋯ ActionSheet menu for strategies + side actions), Tempo Ladder setup (`TempoConfigFields` BPM cards stack vertically via `rowPhone` style), Rhythm Builder (pinch-zoom score in setup + entry; tools reordered to right edge; centered exercise music).
- Log entry chips no longer overflow cards (`maxWidth: '100%'` + card `overflow: 'hidden'`); single-column layout on phone.
- `BpmStepper` play button relabeled `▶ Hear this tempo`.
- "strategies →" hint pointing at the ⋯ menu on phone.
- `FeedbackButton` hidden entirely on phone (and the original bottom-right pill restored on laptop after a mid-session experiment with a side-edge circle stranded it between tool tabs).

**PWA + camera (Step 4):**
- `app/+html.tsx` (new) — PWA + iOS Add-to-Home-Screen meta tags. Viewport: `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no`.
- `public/manifest.webmanifest` + 192/512 icons → "Add to Home Screen" on iOS gives a full-screen app icon.
- `app/upload.tsx` + `app/multi-page.tsx`: drop zone redesign (drag handlers via `useEffect` + `addEventListener` because RN-Web doesn't forward drag through `Pressable`) + a second `<input type="file" capture="environment">` for direct rear-camera capture on phones.
- `lib/image/canvasCrop.web.ts` `stitchVertically` gained `opts.srcWidths` so multi-page composites preserve note scale across crops from differently-framed pages.

**Timer overhaul (`components/PracticeTimersContext.tsx` + `GlobalTimerTray.tsx` + `MetronomePanel.tsx` + `PracticeTimerAlertModal.tsx` + `app/settings.tsx`):**
- New `bodyMove` timer — physical stand-up reminder. Config `{ enabled, intervalMin }`, default 20 min, persisted under `timers.bodyMove`. Fires its own modal overlay (🚶 emoji + "Break" + "Step away from the instrument…" + "On it"). Doesn't suppress during Serial Practice — the body still needs to stand up.
- All four user-facing names normalized to short labels: **Rotate** (was Move On), **Micro** (was Microbreak), **Cold** (was Play It Cold), **Break** (the new bodyMove). Internal config keys (`moveOn / microbreak / playItCold / bodyMove`) unchanged so persisted prefs survive the rename. Renamed everywhere: pill labels, `TIMER_INFO` titles + bodies, `TimerSettingsModal` toggle titles, `PracticeTimerAlertModal` titles, library `/settings` page.
- New `TimerSettingsModal` opens from a ⚙ button in the timer pill — enable toggles + chip-row pickers for interval / break duration / interval — so configuration doesn't require leaving practice and navigating to the library. Cold's full config (interval range + passage picker) still lives in `/settings`.
- `TIMER_DEVICE` palette switched from blue to the metronome's charcoal `DEVICE` palette. Off-state keys use `DEVICE.text` (warm off-white) so the emoji on every timer reads clearly against the charcoal card body; on-state stays `DEVICE.accent` orange. Utility ⚙ / ? buttons use dark glyph color on the new light keys.
- Card sized 360×132 (was 304×144) so all six pill items (4 timer keys + ⚙ + ?) sit in one row on every device. `pillBare` flexWrap forced to `nowrap`. `timerKey` icon bumped 17 → 24 px. ⚙ / ? became key-shaped (38×46) instead of 34 px circles so the row reads as one uniform strip.
- `TimerInfoModal` footer ("Configure interval, break length…in the library") dropped — stale now that ⚙ is in the pill and Cold prompts for a passage on toggle.

**Self-Led:**
- Removed `'recording'` from `SelfLedKey` and from `SELF_LED_STRATEGIES` — the Recorder is now a cross-cutting practice tool available on every screen, so a separate "Recording" strategy is redundant. `SelfLedSheet` icon map trimmed. Routing in `passage/[id]/index.tsx` + `interleaved.tsx` simplified — every picked key now routes to the generic `/self-led/[key]` page. The old `/passage/[id]/self-led/recording` route file stays so old practice-log rows with `strategy: 'recording'` continue to render "Recording · 0:24" in history.

**Click-Up:**
- "Prev" button repurposed as `← Setup` (back to tempo config).
- Resume button on the setup screen when there's an in-progress session.
- `PEDAL` mode toggle removed entirely (header button + phone ⋯ menu item). The keyboard catcher is now always live during the playing phase — a BT foot pedal works without a mode switch.
- Bottom hint on laptop: "Press Space, Enter, or a foot pedal to advance — or tap NEXT." Phone hides the hint.

**Tempo Ladder + Interleaved keyboard shortcuts:**
- `PedalCatcher.web.tsx` gained an optional `secondaryKey` + `onSecondary`. Used by Tempo Ladder + Interleaved to bind X to Miss while Space stays Clean. Native sibling accepts the same props for type parity, ignores them (iPad foot pedal only emits arrow keys).
- Tiny laptop-only hint under the top bar / appended to the existing tempo-hint line: "Space = Clean ✓ · X = Miss ✗".

**Metronome polish:**
- Volume persisted in localStorage (`DEFAULT_VOLUME = 0.7`) — survives reload.
- Sharper, louder click — square wave, 2200/1800/1400 Hz, 2× headroom.

**ToolDock laptop affordances:**
- Corner ⊖ / ⊕ buttons (×1.15 per tap, clamped to `[MIN_SCALE, MAX_SCALE]`) so mouse-only users can resize without pinch. Same `scale` shared value pinch uses — single source of truth.
- Vertical drag clamp loosened to match horizontal: 25% of the card can poke off any edge. The previous `minY: 4` made the Metronome card (already opening near the top of its tab) un-draggable upward.

**Open follow-ups going into the next session:**
- Friend-test the live web build on laptop / phone / tablet.
- iPad cutover (`playpreview` → install → verify on physical iPad → archive `learn-fast-notes/`).
- Pre-existing TS errors in `self-led/[key].tsx` + `self-led/recording.tsx` (cheap cleanup next time those routes are touched).
- Document viewer pinch-zoom (deferred; needs overlays scaled inside the transform).
- Stripe + paid tier (Phase 4.4.2).
- Verify the Microbreak timer is still triggered by practice flows (Tempo Ladder used to fire `microbreak.trigger()` every N clean reps; check that survived rework).
- Verify no orphan Tuner references remain.

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

- **Practice-feedback polish batch** (2026-05-11 → 2026-05-12): batch of
  changes driven by the user actually practicing on the app and surfacing
  rough edges. Shipped across commits 2f2417a (also iPad-local) through
  5258cf5. Highlights:
  - **Reminders** (`components/PassageReminders.tsx`): new "Remind me of
    this next time" checkbox on the note prompt persists `data.remindNext`
    on the practice_log row. A collapsible "📌 Notes for next time (N)"
    banner on the passage screen lists every flagged note (any strategy,
    not just Guided). Each entry has a Dismiss button that clears the
    flag. The banner gates by mount-time `practiced_at` so a note flagged
    at end-of-session does not pop up when the user lands back on the
    passage — it surfaces only on the next re-open. New repo helpers
    `listPassageReminders` + `clearReminder` in `lib/db/repos/practiceLog.ts`.
  - **Note prompt redesign**: `PracticeLogNotePrompt` stripped to a single
    open question ("What do you think is most important to do on this
    next time?"), no emoji row, no subtitle. `title` / `emoji` /
    `subtitle` props stay as no-ops so call sites keep compiling.
  - **Tempo Ladder**: defer the practice_log write to end-of-session
    (one session = one row, gated on `completedSets > 0`). Move "How it
    works" to the top of the config and wrap it in a new
    `components/CollapsibleHelp.tsx` (collapsed by default). On a
    session that reaches goal, raise `start_tempo` by 5 BPM (and
    `cluster_low` for cluster mode), clamped so there is always room
    between start and goal. New repo helper `updateTempoLadderConfigBounds`.
  - **ICU (Interleaved Click-Up)**: microbreak now fires at phase
    boundaries (the step before the tempo resets and the active-units
    window changes), not every 10 reps. "How it works" also collapsible.
  - **Metronome chips** (`components/SubdivisionGlyph.tsx`): the three
    subdivision chips render actual notation (quarter / paired eighths /
    triplet) via `AbcStaffView`, matching the grouping-3 symbol in
    `GroupingPicker`. Tiny phone-header chips keep the unicode fallback
    since `AbcStaffView` has a 40px minimum.
  - **BpmStepper preview**: compact circular play / stop button (no
    "Start" label) so it does not collide visually with the practice
    Start button below.
  - **Rhythm exercise generate**: `FloatingMetronome` takes a new
    `anchor` prop (left or right) and reads `window.innerWidth` in a
    lazy `useState` initializer to dodge the `useWindowDimensions`
    race that was pinning the metronome to the left edge.
  - **Self-Led recording**: stack the Record-again button alongside
    the Log buttons (full-width outline) so people see it before
    logging.
  - **PDF re-crop**: the Crop button on a PDF-backed passage routes
    back to `/document/<docId>?resize=<passageId>` so the user can
    re-crop from the original page rather than the already-cropped
    passage image. In document draw mode, drawing a box switches to
    resize handles (corners + edges + drag-to-move) so the user can
    fine-tune without redrawing.
  - **Serial Practice select**: sections are now flat — every PDF
    document and every folder-with-loose-passages is its own
    peer-level section, sorted alphabetically. Unfiled lands at the
    bottom. New `listAllDocuments` in the documents repo.
  - **Strategy log labels**: spell out `Tempo Ladder` / `Interleaved
    Click-Up` / `Rhythmic Variation` instead of `TL` / `ICU` / `RV`.
    `interleaved` strategy now shows "Serial" or "Interleaved" based
    on the saved `data.order`.
  - **Library mode labels**: "Practice one passage" / "Practice a
    group of passages" as the main button label, with `Blocked` /
    `Serial` demoted to a small subtitle. Practice-mode chips
    (Consistency / Timer) on the Serial Practice config are hidden
    behind a `TIMER_MODE_ENABLED = false` flag — code paths intact.
  - **Add menu labels**: "Add image of passage", "Add PDF", "Add
    folder" instead of "+ New passage" / "+ New full part".
  - **Play It Cold**: always re-opens the passage picker on
    toggle-on, even if a piece was previously chosen.

- **Phase 4.4.1 — tip jar + comp scaffolding** (2026-05-12): first
  foothold in the monetization slot.
  - `lib/links.ts` + `lib/supabase/subscription.ts`: `bmacUrl()`
    helper and `useSubscription()` hook reading the (still empty)
    `subscriptions` table. Returns `{ tier, status, expiresAt,
    isActive }`. `isActive` only true for tier `comp` / `pro` with
    `status='active'` and a future `current_period_end` — expired
    rows fall back to free at read time, no cleanup needed.
  - Settings → new "Support" section above Account with a "☕ Buy me
    a coffee" button (`buymeacoffee.com/playfastnotes`). When the
    hook reports `isActive`, a tinted "Thanks — your free access is
    active through {date}" line renders above it.
  - Library top bar → small ☕ outline button to the left of
    Practice Log. Most users will never land on Settings, so the
    library is the path-of-use surface.
  - `db/schema.sql`: replaced the placeholder comment above
    `subscriptions` with a paste-able SQL snippet for granting one
    year of comp access via Supabase Studio.
  - Storage caps, Stripe checkout, Pro tier, and trial-period
    decisions are intentionally out of scope for this step — they
    revisit in Phase 4.4.2 once there is signal from real users.

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
- **Phase 4.4** (Stripe subscriptions) — not started in earnest; the
  schema slot exists and the first sub-step has shipped:
  - **Phase 4.4.1** (tip jar + comp scaffolding) — shipped. Settings
    has a "Support" section with a Buy Me a Coffee link.
    `useSubscription()` reads the `subscriptions` table and gates a
    "Thanks — your free access is active through {date}" line for
    users on a comp (or future paid) tier. Comp is granted manually
    via Supabase Studio per the workflow comment above the
    `subscriptions` table in `db/schema.sql`.
  - **Phase 4.4.2** (Stripe checkout + Pro tier + storage caps) — not
    started. Decisions still open: free-tier boundary (storage cap vs.
    feature gate), whether to ship a universal free-trial period, and
    web-vs-iPad payment surfaces.

---

## Reference

- Source-of-truth product docs: `../learn-fast-notes/ROADMAP.md`,
  `../learn-fast-notes/CLAUDE.md`.
- Cross-cutting user-facing SOPs, runbooks, infographic, cheat sheet, and
  audit reports — `~/Desktop/Play Fast Notes — Reference/`. Start with
  `README — Start Here.md` in that folder.
- Locked vocabulary (Tempo Ladder, Interleaved Click-Up, Rhythmic Variation,
  Chunking, Serial Practice) — see iPad ROADMAP § Vocabulary.
- iPad screens to mirror — `../learn-fast-notes/app/`.
- iPad design tokens — `../learn-fast-notes/constants/tokens.ts` (copy
  verbatim into this repo when updated).
- iPad reference screenshots used for porting — `reference-screenshots/ipad/`.
