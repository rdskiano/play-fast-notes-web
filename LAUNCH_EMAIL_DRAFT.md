# Launch email to existing Play Fast Notes users — DRAFT v3

**Not sent. Ralph sends this himself after approving it.**

v3 written 2026-08-28. v1's bullets were wrong on the facts (Ralph caught it);
v2 was right on facts but undersold the app (Ralph caught that too).

## Who this reaches (checked in the live database, 2026-08-28)

- 102 accounts total
- 42 have practiced in the last 90 days
- 16 have practiced in the last 30 days
- 35 currently hold Pro (15 of those lifetime); 45 rows have lapsed

A launch note and a wake-up note at the same time. Write it for the 42.

## Subject line

Play Fast Notes is on the App Store

## Body

Hi,

Play Fast Notes is on the App Store:

https://apps.apple.com/us/app/play-fast-notes/id6777245595

It's free to download and your account comes with you. Sign in and your pieces, passages, and practice history are already there. What you do on the iPad shows up on the web, and the other way round.

I use both, and the app is the better one to practice with. It's faster and smoother on a stand. Your music lives on the iPad rather than coming down a connection every time, so pages come up straight away, and once you have opened a piece it keeps working in a room with no wifi. Pencil marks are fully editable there too: you can erase and change them, not only add on top.

If you already unlocked Pro, it carries over. Nothing to buy again.

I'd like to know how it feels on a real stand in a real practice room. Reply and tell me what breaks.

Ralph

## What changed from v1, and why (Ralph was right)

v1 claimed three iPad-only advantages. Two were wrong. Checked in the code:

- ❌ **"Bluetooth foot pedal"** — cut. `components/PedalCatcher.web.tsx` is a full
  116-line implementation; pedals pair as keyboards and the web build listens for
  the same keys. Works on web. Not a difference.
- ❌ **"Full screen on the stand"** — cut. Installed to the home screen the way the
  app already prompts, the web version is full screen too. Not a difference.
- ✅ **Apple Pencil** — kept, but narrowed to what is actually true.
  `PencilCanvas.web.tsx` (480 lines) DOES let iPad Safari draw with the Pencil
  using Pointer Events and pressure. The real difference is editability: the
  native PencilKit canvas can erase and modify earlier strokes; the web canvas
  treats previous marks as a flattened background and can only add on top.
- ✅ **Offline** — ADDED, having been wrongly cut from v1. See below.

## The offline correction

v1 left offline out because an old note claimed the notation renderer pulled a
library off the network and that lazy library download was never finished. Both
claims were stale. In the current code:

- `lib/notation/abcjsSource.ts` bundles 524 KB of abcjs into the native app, and
  the web build requires the npm package. Notation renders with no internet on
  both platforms. The CDN load was killed in July after it failed at Interlochen.
- `lib/assets/materializeAssets.ts` (SYNC_PLAN Phase 3, shipped 2026-08-15)
  downloads a passage's files into the sandbox the first time it is opened and
  rewrites the row to local paths, so "the music works in a dead-wifi practice
  room". Lazy library download was finished.

The wording in the email is deliberately "once you have opened a piece", because
that is the actual behaviour. Music added on the web that this iPad has never
opened still needs one connected open to come down.

## v3 change — the feature audit undersold the app, per Ralph

v2 ended with "you are not missing much", drawn from a code-level feature
comparison. Ralph rejected that on 2026-08-28: he uses both daily and says the
iOS app is clearly faster, smoother and less clunky, and that going back to the
web version he can feel the difference even while being impressed by how close
it gets. He is the one with both on a music stand; feature parity is not feel.
So v3 cuts the apology, leads with "I use both, and the app is the better one to
practice with", and folds the offline and Pencil points into that sentence
instead of listing them as if they were the whole case.

The speed claim is his, in his own voice, which is the right way to carry it.
Local SQLite reads and on-device files instead of network round-trips is the
plausible reason it feels that way.

## Why sending this matters beyond the announcement

App Store search still has not indexed the app. Search ranking leans on install
signals, so real installs from people who want it is the only lever available.
With 42 plausible recipients it will not fix indexing by itself, but it is the
one thing that helps.
