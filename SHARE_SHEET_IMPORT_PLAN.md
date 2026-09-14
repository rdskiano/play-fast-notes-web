# Share-sheet PDF import — v1.2.0 build plan

Decided with Ralph 2026-09-14 (scope questions answered same day):
**PDFs only**, **nothing else rides in the build**. This feature IS the
forScore integration (forScore has no API; its share sheet is the only door).
Background: B-090/B-091 in BUGS.md — the Files picker's search proved fragile
with cloud providers enabled, and all Google Drive / Dropbox promises were
pulled from the copy. The share sheet replaces that whole path: users push
PDFs to us from the Drive/Dropbox/forScore/Mail apps instead of us fishing
through Apple's picker.

## User story (the whole feature)

You're in the Google Drive app looking at Mahler 9. Share → "Copy to
Play Fast". Play Fast opens with the little Add window already on the
"Name this part" step, name pre-filled from the filename. Tap Add to
library, the part opens. Works identically from Dropbox, Mail, Safari,
AirDrop, and forScore. Landing spot: library root (move it later if wanted).

## Implementation

1. **app.json** — declare PDF handling in `ios.infoPlist`:
   - `CFBundleDocumentTypes`: one entry, `LSItemContentTypes:
     ["com.adobe.pdf"]`, `CFBundleTypeName` "PDF", handler rank
     `Alternate`.
   - `LSSupportsOpeningDocumentsInPlace: false` — iOS then COPIES the shared
     file into our sandbox at `Documents/Inbox/<name>.pdf` and launches the
     app with that file URL. We want the copy (addPdfDocument persists its
     own copy anyway; Inbox is not a place to keep files).
   - Version: 1.1.1 → **1.2.0**, but ONLY at Stage 2 (build time), not with
     the Stage-1 code. Bumping early would make interim `eas update`
     publishes target runtime 1.2.0 — reaching nobody, since every install
     is still on 1.1.1. The Stage-1 JS ships dormant on 1.1.1 binaries
     (they never receive file:// URLs without the Info.plist entry).
     ⚠️ At bump time: eas.json has `appVersionSource: "remote"` — bump BOTH
     app.json's `version` (drives the runtime version that `eas update`
     computes locally) AND the remote (`eas build:version:get` /
     `build:version:set`) so the build's runtime and future OTA publishes
     agree. Mismatch = OTAs that reach nobody.

2. **`lib/files/incomingShare.ts`** (native) + `.web.ts` no-op:
   - `Linking.getInitialURL()` (cold start) + `Linking.addEventListener('url')`
     (warm). Accept only `file://` URLs ending `.pdf` (case-insensitive);
     ignore everything else (the `playfastnotes://` scheme links must keep
     working untouched).
   - Immediately copy the file out of `Documents/Inbox/` into the cache
     directory (timestamped name — see the iOS image-cache lesson) and
     delete the Inbox original. Remember `{ uri, name }` as the pending
     share; expose subscribe/consume.

3. **Wiring** — reuse the B-090 `initialAssets` plumbing wholesale:
   - A top-level hook (mounted in `_layout.tsx`, native only): on share
     arrival, `router.push('/library')` if not already there.
   - `app/(tabs)/library.tsx`: on focus, consume the pending share →
     `setPickedAssets([file])`, `setAddFlow('pick')`, `setAddOpen(true)` —
     the Add window opens straight on the name step, exactly like a Files
     pick. No new UI.
   - Cold start order: the auth gate and library load run first; the pending
     share just waits until the library screen focuses. Signed-out user
     lands on sign-in; share is consumed after they're in.

4. **What's New entry** (ship step 0) + restore honest cloud copy: the Add
   PDF row desc can say shared-from-other-apps once this ships. Do NOT
   re-add Google Drive/Dropbox picker promises (see BUGS.md B-090 closure).

## Stage 1 — DONE 2026-09-14 (sim-verified)

All implemented and verified in the iPad Air sim (dev client, local
xcodebuild). TWO bugs found and fixed during verification:

1. First warm test: the Add window opened on the name step and then
   instantly closed — the layout's own subscription was ALSO navigating to
   the already-showing library, pushing a fresh copy whose reset state
   killed the modal. Lesson: never navigate to the route you're on.
2. Second warm test surfaced the real navigation problem: expo-router
   consumed the incoming file path as a route → "Unmatched Route" screen.
   Fix: `app/+native-intent.tsx` (`redirectSystemPath`) rewrites *.pdf
   system paths to `/library` before routing; everything else passes
   through. With that in place the layout does NO navigation at all — it
   only starts the capture listener.

Verified in the sim: share sheet shows "Play Fast" for a PDF; warm share →
name step → Add → part opens; cancel from the name step returns to the Add
menu; COLD start (app killed, share from Files) → app boots to the library
with the name step up, even through the dev-client launcher detour;
`playfastnotes:///tools` scheme link still routes normally. Cleanup: test
doc add+delete round-tripped on the live account (soft-deleted, verified
in Supabase).

## Stage 2 — build submitted 2026-09-14

Version bumped to 1.2.0 (commit dbe715d; remote buildNumber auto-bumped
from 15). EAS production build f09a9043 FINISHED and submitted to App
Store Connect (submission 3b916cf7) — awaiting Apple processing, then
Ralph installs via TestFlight and tests real Drive/Dropbox/forScore/Mail
shares. ⚠️ From dbe715d on, every `eas update` targets runtime 1.2.0:
users still on App Store 1.1.1 receive NO new OTAs until the 1.2.0 App
Store release ships and they update. Don't ship OTA-only fixes for 1.1.1
users during this window. App Store release only after Ralph's TestFlight
pass.

## Verification ladder

1. **Simulator (Claude, free)**: local Xcode build per the sim runbook
   (app.json changed → `rm -rf ios && npx expo prebuild` first). Seed a PDF
   into sim Files (File Provider Storage trick in the B-090 session), then
   Files app → share → Copy to Play Fast: cold start AND app-already-running,
   plus a non-PDF share rejection, plus a plain scheme deep link still works.
   NOTE: the sim dev client signs into Ralph's REAL account and syncs — use
   the add-then-delete round trip, or sign into the screens account.
2. **TestFlight (Ralph, real iPad)**: `eas build --profile production` (auto
   buildNumber), `eas submit -p ios --latest` — the build appears in
   TestFlight for him before/while App Store review runs. His test: share
   from the real Google Drive app, from forScore, and from Mail. Only after
   his pass: release the version on the App Store.
3. **After release**: Ralph's iPad updates from the App Store once; OTAs
   thereafter target runtime 1.2.0 (users still on 1.1.1 stop receiving new
   OTAs until they update — same as every release).

## Costs / timing

- Expo plan drops to Free after 2026-09-23 — building before then rides the
  paid queue (nice, not required). Apple review typically 1–3 days.
- No new permissions, no new native modules — just Info.plist + JS. Apple
  re-reviews IAP screens as part of any release; nothing changed there.
