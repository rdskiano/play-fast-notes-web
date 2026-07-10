# Play Fast Notes — Bug Log

_The one place a known bug lives until it's verified fixed on every affected surface._

This file replaces "I'll remember to check that" and the mental tax of bug-chasing across devices. The rule is simple: if you can reproduce something wrong, it goes in here with enough detail that future-you (or a Terminal Claude) can reproduce it from the file alone.

## How this works

**Five surfaces.** Every bug is tagged with the surface(s) where it reproduces:

- `iphone-web` — playfastnotes.com via mobile Safari (and PWA install)
- `iphone-native` — Expo iOS build on iPhone (universal binary, same build as iPad-native)
- `laptop-web` — playfastnotes.com in desktop Chrome / Safari
- `ipad-native` — Expo iOS build on iPad
- `ipad-web` — playfastnotes.com in iPad Safari

**Workflow.**

1. **See a bug → log it here.** Don't try to fix it in the moment unless it's blocking the thing you're doing. Logging the bug first prevents the "I'll fix this real quick" rabbit hole that drains a session.
2. **Triage = severity + surface(s).** Only fill in surfaces you've actually checked. If you only saw it on iPad and didn't try laptop, write `ipad-native (others not checked)`.
3. **Fix = verify on every affected surface.** A bug is not Fixed until you've reproduced the original repro steps on each listed surface and seen the new behavior. Mark each surface's verification date next to the surface tag.
4. **When you fix one, scan for siblings.** If the bug was a missing platform guard in a shared component, grep for the same pattern elsewhere. Fix the class, not the instance. (CLAUDE.md flags this as a recurring failure mode in this codebase.)

**Severity tags.**

- `P0` — blocks the launch. Crash, data loss, can't sign up, payment broken.
- `P1` — embarrassing but launchable. Visual glitch on common path, slow but works, edge-case crash a normal user wouldn't hit.
- `P2` — nice-to-have. Polish, ergonomics, things that bug *you* but a friend-tester wouldn't notice.

**One bug per entry. Don't combine.** If two things break in the same place, log two entries — they may have different fixes and need separate verification.

---

## Active

_Bugs that reproduce. Newest at the bottom. When fixed, move to "Verified fixed" below with a date._

### 2026-07-08 batch (from Ralph) — triaged, not yet started

**A. Quick web fixes**
- **B-001** ✅ FIXED 2026-07-08 (code, not pushed): `PassageReminders` moved from the bottom of the passage page to directly under the score (above the "What should I practice?" hero). app/passage/[id]/index.tsx.
- **B-002** `iphone-web` `ipad-native` — Metronome VOLUME slider doesn't change loudness on phone. NOTE 2026-07-08: the web click gain DOES scale with volume (`level * volRef * 2`, useMetronome.web.ts) and the slider taps fire — so this is almost certainly the phone slider controlling a DIFFERENT metronome instance than the one clicking. → folded into the metronome cluster (B-006/007), fix with device + verify by ear. Don't blind-patch the gain.
- **B-003** ✅ FIXED 2026-07-08 (code, not pushed): Tempo Ladder mode switch now carries the upper tempo between the two field layouts (Step/Custom `goalTempo` ↔ Cluster `clusterHigh`); Start/Low/Base already shared `startTempo`. Was: switching to Cluster reset high to `startTempo+10`. hooks/useTempoLadderSession.ts `setModeAndSyncCluster`.
- **B-004** `laptop-web` — Rhythmic Variation grouping picker: numbers/note-symbols not aligned (symbols left of center). NEEDS VISUAL PASS: it's abcjs bbox-centering inside GroupingPicker's fixed-width `AbcStaffView` — pixel-level, must be seen in-browser to fix right (can't reach the screen without auth). Don't blind-tweak.
- **B-005** `iphone-web` — Spot selection poor on iPhone web. NEEDS REPRO DETAIL: which screen (document viewer box-tap? micro/macro-chaining spot select? Click-Up?) and what fails (missed taps / wrong spot / can't tap). iPhone-touch-specific — needs on-device repro before touching tap thresholds.

**B. Metronome / Tempo Ladder behavior (high-pain per Ralph)**
- **B-006** `ipad-native` `laptop-web` — Tempo Ladder should START the metronome click automatically when you begin practicing ("really isn't useful without a clicking metronome"). Likely same root as B-008.
- **B-007** `ipad-native` `laptop-web` — Metronome timbre CHANGES when you open the Metronome tool: Tempo Ladder starts a click immediately, but opening the metronome swaps the sound. (Two metronome sources / patterns diverging.)
- **B-008** `laptop-web` — Rhythmic Variation playback: every 2nd–3rd note has a very LOUD click accompanying it. (accent/downbeat click bleeding into pitch playback.)

**C. iPad-native (needs the device; get diagnostics before patching)**
- **B-009** `ipad-native` — Document scanner is poor: edge detection barely works, no re-crop option in the flow, and there's a page-count LIMIT when adding to a PDF. (biggest item.)
- **B-010** `ipad-native` — "Done, log it" button is very hard to find in Rhythm Variations (rhythms-only) on iPad.
- **B-011** `ipad-native` — Marking a spot requires tapping Save at least TWICE every time.

**D. Features**
- **B-012** — Photo option: add a black-and-white / clarified (higher-contrast) version of the photo.
- **B-013** — Once a PERFORMANCE tempo is set for a spot in one strategy, preload it for that spot in all other strategies. (per-passage performance-tempo memory shared across strategies.)

### Template (copy this when adding a new bug)

```
### B-NNN — <one-line title>

- **Severity:** P0 / P1 / P2
- **Surfaces:** iphone-web | laptop-web | ipad-native | ipad-web (mark only what's confirmed)
- **Reported:** YYYY-MM-DD
- **Repro:**
  1. ...
  2. ...
  3. Expected: ...
  4. Actual: ...
- **Notes:** anything that might point at the cause (recent commit, related screen, console error, what changed since it last worked)
- **Status:** Open / In progress / Awaiting verification / Fixed (with per-surface verification dates)
```

---

## Verified fixed

_Bugs that no longer reproduce on every listed surface. Keep them here as a trail so we don't reintroduce the same issue. Don't delete._

(none yet)

---

## Won't fix

_Bugs that were logged and consciously parked. Each has a reason. Reasons that are valid:_

- _Out of scope for current surface (e.g. iPhone native — not building it)._
- _Costs more to fix than the bug is worth (P2 with a hard fix)._
- _Already known and deferred per a ROADMAP entry (link to the entry)._

(none yet)

---

## Smoke checklists (run weekly + before any push)

Per-surface, 5-minute walks. Build these up over time — every time a bug ships that a checklist would have caught, add the missing item.

### iPhone web (PWA)

1. Open playfastnotes.com in mobile Safari. The InstallPrompt modal appears.
2. Add to Home Screen. Re-launch from the home icon — opens full-screen, no browser chrome.
3. Sign in.
4. Upload a passage via camera capture (📷 button → take photo → crop).
5. Open the passage. Tempo Ladder → set Base, Performance, Step → start → tap Clean a few times.
6. Open the Recorder tool tab → record 5 sec → play back at 0.5×.
7. Open the Metronome tool tab → start → change BPM → change meter → tap a Rhythm.
8. Library → 🔀 Rep Rotator → pick 2 passages → start → cycle.
9. Force-quit the PWA and re-open. State you expected to persist did persist.

### iPhone native

1. Launch the iOS build on your iPhone (TestFlight or dev client).
2. Sign in (post-C2) or skip auth (pre-C2 / free-tier).
3. Upload a passage via the in-app camera or photo roll.
4. Crop. Open passage. Tempo Ladder runs end to end. ✗/✓ floating buttons are reachable with one thumb.
5. Open the Recorder tool tab. Record 5 sec. Play back at 0.5×. Mic works on the iPhone built-in.
6. Open the Metronome tool tab. Tap a Rhythm. Audio plays without crackle.
7. Pencil tab is hidden (no Apple Pencil on iPhone).
8. Library and practice log render readably at iPhone width — no clipped titles, no overlapping elements.
9. Force-quit. Re-open. State persists.

### Laptop web — comprehensive

_Run top to bottom in Chrome or Safari at playfastnotes.com. Log every issue into BUGS.md (or the bug logger) as you find it — don't stop to fix. Sections can be split across sittings; do at least Auth + Library + one full Strategy in a session._

**Auth**
- [ x] Open playfastnotes.com signed out — sign-in screen renders.
- [ x] Sign up with a fresh email + password — get into the app.
- [ x] Sign out — back to sign-in screen.
- [ x] Sign in with existing account — library loads.
- [ x] Sign out, sign in as a different account — no library leak (you only see your own passages).

**Library**
- [x ] Library renders without errors (folders, loose passages, PDFs all visible).
- [ x] Search the library — typing filters results live.
- [ x] Create a folder. Rename it. Move a passage into it. Delete an empty folder.
- [ ] Long folder/passage title doesn't clip or break layout.
- [ ] 🔀 Rep Rotator button in the top cluster opens the Rep Rotator config.
- [ ] Practice Log button opens the library-wide log.
- [ ] ⚙ Settings opens settings.
- [ ] "?" help menu opens.
- [ ] Mode segment row (single passage vs group) toggles correctly.

**Add passage**
- [ ] Drag-drop a single image onto the upload zone — saves and opens the cropper.
- [ ] File-picker upload of a single image — same flow.
- [ ] Crop a passage from the cropper — saves, thumbnail appears in library.
- [ ] Re-crop an existing passage — the saved view shows the new crop (no stale image).
- [ ] Restore-original on a re-crop.
- [ ] Upload a multi-page PDF — pages render, you can draw passage boxes on each.
- [ ] Multi-page-from-photos flow — order is preserved, stitched image is clean.

**Passage detail**
- [ ] Open a passage — score renders, pinch zoom works (Ctrl/⌘ + scroll on trackpad).
- [ ] Strategy picker shows Tempo Ladder, Click-Up, Rep Rotator pill, Rhythmic, Rhythm Builder, Self-Led.
- [ ] Practice log for this passage renders.
- [ ] Delete a passage — gone from library; log entries handle the deletion.
- [ ] Section markers on a PDF passage are draggable.

**Document viewer (PDF parent)**
- [x] Open a PDF doc — page nav arrows in top corners (not blocked by tool tabs).
- [x] Draw a new passage box on a page — saves.
- [x ] Resize an existing passage box — saves.
- [ x] Page-level recordings save and play back.
- [na ] Pencil annotation on a PDF page is shared with passages cropped from that page (open one, see the mark).

**Strategy — Tempo Ladder**
- [ x] Step mode end to end: set Base, Performance, Increment, Reps-to-advance. Hit Clean N times — tempo advances. Hit Miss — behavior matches mode.
- [x ] Cluster mode end to end.
- [x ] Custom mode: build a pattern in the editor (≥2 blocks), save, see the dot-strip preview.
- [x ] Custom mode: run a session, hit a Miss mid-pattern — strict reset to block 0 / rep 0.
- [ x] Custom mode: complete one clean pass — base BPM bumps by Increment.
- [ ] Resume in-progress session works (close the screen, come back, "Resume" button on setup).
- [x ] Space = Clean, X = Miss (laptop hint should be visible).
- [ x] Celebration modal fires at the right milestones.
- [x ] Note prompt on session end saves to the practice log.

**Strategy — Interleaved Click-Up**
- [ x] Setup → marking phase: tap to mark sections on the score.
- [x ] Playing phase: Space = NEXT.
- [x ] Back step: ← / Backspace / ArrowUp / PageUp all step backward; ← BACK button works.
- [ x] DONE button writes an early log entry.
- [ x] Auto-log on full finish writes a session log.
- [ ] Resume in-progress works.

**Strategy — Rep Rotator (formerly Serial Practice)**
- [ x] 🔀 button from library → config → pick passages.
- [x ] PassagePicker: drill into a folder, drill into a PDF (see passage boxes overlaid on pages), tap to select.
- [ x] Per-PDF count badges are right.
- [x ] "?" help button → RepRotatorExplainerModal renders.
- [ ] First-run TutorialStep fires on select phase (clear localStorage if you've already seen it: key `pfn:tutorial:rep-rotator-first-run`).
- [ x] Caption "Passages will appear in random order." is visible; no Order chips.
- [ x] Start session → passages cycle.
- [x ] Per-spot tempo memory: change BPM on passage A, cycle to B, cycle back to A — BPM restored.
- [ ?] Practice log entry on session end.
- [ x] From passage detail, "Rep Rotator" pill seeds the picker with that passage pre-selected.

**Strategy — Rhythmic Variation**
- [ x] Open from passage detail.
- [ x] Grouping picker (3-8) responds.
- [x ] AbcStaffView renders the chosen pattern.
- [ x] Floating rhythm card: drag, collapse (arrow no longer captured as drag), Loop rhythm plays at correct tempo for non-quarter denominators (3/8 etc.).

**Strategy — Rhythm Builder**
- [ x] Setup → Generate phase: numbered exercises render.
- [ x] Each exercise plays back in sync with the metronome (▶ on the card).
- [ x] Change BPM mid-playback → playback retempos live.
- [ ] Time signature variants (4/4, 3/8, 6/8) all play with correct note durations.
- [x ] "Print PDF" → title-prompt modal → marketing-quality PDF renders (centred branding, numbered exercises, footer).

**Strategy — Self-Led**
- [x ] Generic Self-Led route opens.
- [ na] Old practice log entries with `strategy: 'recording'` still render correctly in the log.

**Practice tools — Metronome**
- [x ] Open the Metronome tool tab. Card pops out.
- [x ] Start/stop works.
- [x ] BPM up/down stepper works.
- [x ] Volume slider persists across reload.
- [x ] Meter picker (x/4, x/8, compound x/8, odd x/8) updates the beat-dot row correctly.
- [x ] Subdivision picker (1/2/3/4) updates click pattern.
- [x ] Per-beat dots: tap to cycle accent / click / silent.
- [x ] Tap tempo button (desktop) responds.
- [x ] RHYTHMS button → overlay → pick a groove (Rock, Pop, Funk, Waltz, etc.). Plays at current tempo. Changing meter clears the groove.
- [ x] "Just the click" returns to plain metronome.
- [x ] Drag the card around. Pinch / ⊖⊕ resize works.

**Practice tools — Recorder**
- [ x] Open Recorder tool tab.
- [ x] Live input meter responds when you make sound.
- [ x] Record → stop → playback at 1× sounds correct.
- [x ] Playback at 0.75× and 0.5× preserves pitch (no chipmunk effect).
- [ x] Save to passage practice log → entry appears with playable recording.
- [x ] Save to document practice log (from PDF viewer).
- [ ] Empty recording (record then stop instantly) shows the "Recording is empty" guard.

**Practice tools — Timers**
- [ x] Open the Timer pill in the tool dock.
- [ ] In-tool ⚙ Settings sheet opens; toggle each of the 4 timers.
- [ x] Enable Rotate (Move On) → fires its modal at the set interval during a Tempo Ladder session.
- [x ] Enable Micro → fires its modal at the set interval (check whether it actually triggers — open thread per ROADMAP: confirm `microbreak.trigger()` is wired into Tempo Ladder's N-clean-reps logic).
- [ ] Enable Cold → picker prompts for the cold passage when toggled on; fires the modal at the set interval.
- [ ] Enable Break (bodyMove) → fires its modal every N minutes.
- [ ] All four timer modals dismiss with "On it" and don't break the underlying session.

**Practice tools — Pencil (stylus-gated on web)**
- [x ] On a laptop with no stylus: Pencil tab is hidden by default.
- [ ] Open passage with `?pencil=1` URL param → tab appears.
- [ ] Draw a stroke with the mouse (since pencil is forced on via the param) — strokes render with perfect-freehand.
- [ ] Undo: Cmd/Ctrl+Z + the undo button.
- [ ] Save → forward-nav to a different passage → come back → annotation composites onto the saved PNG.
- [ ] 2.5s idle auto-save (verify by drawing, waiting, navigating away without explicit save).

**Practice tools — Foot pedal (Bluetooth keyboard emulator)**
- [ x] In Click-Up playing phase: pressing Space / Enter / Page Down advances.
- [x ] In Tempo Ladder: Space = Clean, X = Miss.
- [ ] Type into a text input (e.g. note prompt) — arrows don't trigger anything (typing-target protection).
- [ ] Auto-repeat de-dupe: a long-pressed key doesn't fire repeatedly.

**Practice log**
- [ ] Per-passage log shows tempo ladder entries with mode + reps.
- [ x] Recording entries play in the log.
- [ x] Document-level log shows recordings made on the PDF viewer.
- [ ] Folder-level log aggregates passages in the folder.
- [x ] Library log shows everything.

**Settings page**
- [x ] Timer settings (full Cold config — interval range + passage picker) live here.
- [ x] Other settings render without errors.

**Edge cases**
- [ ] Reload the page mid-practice — state recovery is graceful (or at least: no crash).
- [ ] Offline (toggle DevTools "Offline") — service worker serves cached PDFs/images. Page doesn't go fully white.
- [ ] Very slow network (DevTools "Slow 3G") — loading states appear; nothing hangs forever.
- [ ] Resize window between phone-width and laptop-width — layout responds (this is how you test responsive without leaving the laptop).

When you're done, total bugs logged is the laptop-web bug count. Triage by severity. P0s block the launch; fix them before moving to iPhone web.



### iPad native

1. Launch the dev client (or TestFlight build after C3).
2. Sign in (after C2 ships) or skip auth (pre-C2 / free-tier).
3. Upload a passage via the document scanner or camera roll.
4. Crop, open the passage, run Tempo Ladder. Pinch-to-zoom the score. Annotate with Apple Pencil. Marks save (auto-save 2.5s after last stroke; verify also forward-nav flush).
5. Run Interleaved Click-Up. Connect a Bluetooth foot pedal — arrow keys advance.
6. Open the Recorder. Record. Play back at 0.5×. Save to passage practice log.
7. Force-quit and re-open. Practice log + library survive. Pencil marks survive.
8. Run `/import-supabase` if testing sync (post-C2).

### iPad web

1. Open playfastnotes.com in iPad Safari.
2. Sign in.
3. Pencil tab is visible (tablet-detection rule from `usePenDetected.web.ts`).
4. Annotate with Apple Pencil. Marks composite onto saved PNG.
5. Run a Tempo Ladder. Pinch-zoom works.
6. Add to Home Screen → re-launch as PWA → all of the above still works full-screen.

---

## Notes on the protocol

- **The bug log is more valuable than your memory.** Even if a bug is "obvious," log it. The point of the file is that you can step away for two weeks, come back, and the open list is still the open list.
- **"Affected surfaces" is the load-bearing field.** It's what stops you fixing on laptop, testing on laptop, and shipping without checking the iPad-native variant of the same component.
- **The class-scan step is non-negotiable.** Half the time-loss in cross-surface debugging is that fixing one instance leaves three siblings live. Per CLAUDE.md the pattern is: latent web-only code in shared files (DOM globals, raw HTML JSX, browser-only APIs). Grep the class on every fix.
- **Friend-testers count as a smoke source.** If a friend reports something, log it here verbatim before reaching for a fix. Their phrasing is often the actual repro you need.
