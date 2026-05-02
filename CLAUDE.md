# Play Fast Notes — web companion (working notes for Claude)

This is the **web** codebase. It's a separate repo from the iPad app (which lives next door at `../learn-fast-notes/`). Both apps share a Supabase backend for auth + practice log + future subscriptions, but UI / build / deploy pipelines are independent.

The user is **not a developer**. Always give them one-word terminal shortcuts (e.g. `playweb`), never long `cd ... && npx ...` lines that break on paste due to spaces in paths.

## Sibling layout

```
~/Desktop/APPS/iphone playfastnotes/
├── learn-fast-notes/        ← iPad app (DO NOT EDIT from this repo's tasks)
└── play-fast-notes-web/     ← you are here
```

The iPad repo is the design north star (per `../learn-fast-notes/ROADMAP.md` Phase 4). When porting screens, copy from the iPad repo and adapt — never modify the iPad repo to suit web needs.

## Running locally

1. `playweb` (after the alias is added to `~/.bash_profile`) → starts `npm run web`.
2. Browser opens at `http://localhost:8081`.

If `playweb` doesn't exist yet, the user can run `npm run web` from this folder directly.

## Supabase

- The user has **multiple Supabase projects** in their account. The web app talks to the project whose ref appears in `.env.local` as `EXPO_PUBLIC_SUPABASE_URL`. Currently `uugodzwxuxgfwujnwpuq` (project name "play-fast-notes-web"). Always confirm the dashboard URL bar matches this ref before running SQL or making bucket changes — running setup against the wrong project looks identical and silently fails to apply.
- Schema lives in `db/schema.sql` — the user pastes this into Supabase's SQL editor once, when setting up the project. Re-run is idempotent (`create table if not exists`).
- Auth is **email + password**, configured in `lib/supabase/auth.ts`. The single `continueWithPassword(email, password)` helper tries `signInWithPassword`, falls through to `signUp` if no account exists, and surfaces a friendly error otherwise. **Email confirmation must be OFF** in Supabase (Auth → Providers → Email → "Confirm email" toggle), otherwise signup returns no session and the UI hangs. We chose password over magic link for testing-phase friction; magic link will likely come back at Phase 4.4 alongside Stripe.
- Every table has Row Level Security with policy `auth.uid() = user_id`. Inserts auto-fill `user_id` via a column-level `default auth.uid()`, so repos don't need to set it manually.

### Storage bucket setup (one-time, dashboard-only — not in `db/schema.sql`)

`db/schema.sql` covers tables only. Storage bucket policies live on `storage.objects` and must be set up separately in the Supabase dashboard. Symptom of missing setup: image uploads fail with `new row violates row-level security policy` while title-only saves succeed.

Setup steps (per project):

1. Dashboard → Storage → "New bucket". Name it exactly `pieces` (lowercase). Leave "Public bucket" OFF — the SQL below grants public read.
2. Dashboard → SQL Editor → paste and run:

```sql
drop policy if exists "pieces_public_read" on storage.objects;
create policy "pieces_public_read"
on storage.objects for select to public
using (bucket_id = 'pieces');

drop policy if exists "pieces_owner_insert" on storage.objects;
create policy "pieces_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'pieces'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "pieces_owner_update" on storage.objects;
create policy "pieces_owner_update"
on storage.objects for update to authenticated
using (bucket_id = 'pieces' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'pieces' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "pieces_owner_delete" on storage.objects;
create policy "pieces_owner_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'pieces' and auth.uid()::text = (storage.foldername(name))[1]);
```

The `upsert: true` flag in `lib/supabase/storage.ts` requires the update policy in addition to insert. The path scheme is `<user_id>/<piece_id>.<ext>`, so the foldername check pins each user to their own subfolder.

## Persistence layer

Repos in `lib/db/repos/*.ts` mirror the function signatures of `../learn-fast-notes/lib/db/repos/*.ts`. They're the seam where SQLite (iPad) becomes Supabase (web). Keep signatures aligned with iPad — when iPad evolves, the web repos should evolve in lockstep.

**Conventions worth knowing:**

- **`source_uri = ''` for title-only pieces.** Image upload via Supabase Storage is a later phase. Until then, `upload.tsx` saves pieces with an empty `source_uri` and `null` thumbnail. Library and piece detail render gracefully without thumbnails. The Postgres `NOT NULL` constraint is satisfied by the empty string.
- **Embedded foreign-key joins return arrays even for 1-to-1.** Supabase's TypeScript inference types `pieces.folders(...)` as an array. Cast through `as unknown as <ExpectedShape>` to assert the actual single-object shape, or check the array first. See `lib/db/repos/practiceLog.ts` for the pattern.

## Audio (metronome)

The metronome on web is a hand-rolled Web Audio API scheduler at `lib/audio/useMetronome.ts`. The iPad app uses `react-native-audio-api`; we intentionally did not depend on that on web because Web Audio is a clean, stable interface and the dependency isn't needed. The scheduler uses an `AudioContext` clock with a 100ms lookahead — stable timing despite main-thread jitter. Browsers require a user gesture before audio plays (the Start metronome button satisfies this).

The hook also includes a **rhythm-pattern looper** (`startRhythmLoop` / `stopRhythmLoop` / `toggleRhythmLoop` + `rhythmLooping`) used by Rhythmic Variation. It walks an array of `RhythmToken`s and schedules each click at `tokenQuarterFraction × (4 / beatDenominator) × (60 / bpm)` seconds. A dedicated `GainNode` (`rhythmGate`) lets stop calls mute anything already queued in the lookahead window.

## Notation rendering (abcjs)

`components/AbcStaffView.tsx` renders ABC notation as a staff snippet for Rhythmic Variation. abcjs is **loaded from the unpkg CDN at runtime via a script-tag injection** — no `npm install abcjs` is needed. The first call adds `<script src="https://unpkg.com/abcjs@6/dist/abcjs-basic-min.js">` and resolves a shared promise on `script.onload`; subsequent renders read `window.ABCJS` directly.

iPad's AbcStaffView lives in a WebView and uses scale 1.0 for centered (small) usages and 1.6 for the playing-card. The web port mirrors those scales and uses `staffwidth = width - 10`, **without** `responsive: 'resize'`. With `responsive: 'resize'`, abcjs stretches notes to fill the parent container — fine for big cards but ugly when the parent is narrow. Keeping it off makes notes render at their natural compact size.

`lib/notation/buildAbc.ts` is a direct copy of the iPad version — it converts a `RhythmPattern` into an ABC string with auto-beam grouping based on time signature.

## Floating cards: drag + pinch

`FloatingSlowClickUpControls`, `FloatingClickUpControls`, `FloatingMetronome`, `FloatingRhythmCard` are draggable + pinch-resizable. iPad uses `useDraggableCard` (Reanimated + react-native-gesture-handler). Web uses pointer events directly:

- One pointer on the drag handle → drag
- Two pointers anywhere on the card → pinch (track distance change, scale 0.6–1.6)
- `wheel` event with `ctrlKey: true` → trackpad pinch on Mac (Chrome/Safari fire this for trackpad pinch)
- The card is `position: absolute` with `transform: scale(...)` and `transformOrigin: 'top left'`

## Supabase quirks worth knowing

- **PostgREST cannot infer FKs between `practice_log`, `pieces`, `exercises`, `folders`** in this project. Embedded joins (e.g. `practice_log?select=...,exercises(name)`) return `PGRST200`. Workaround: fetch tables separately and join client-side via `Map<id, row>`. See `lib/db/repos/practiceLog.ts` for the pattern (`getPracticeLogForLibrary`, `getPracticeLogForPiece` both use it).
- **Storage URLs need a cache-buster.** When a piece is re-cropped, the upsert path is the same (`<userId>/<pieceId>.<ext>`), so the public URL is identical. Browsers and the Supabase CDN serve the stale bytes. `lib/supabase/storage.ts` appends `?v=<Date.now()>` to the returned URL, and that goes into `pieces.source_uri` — every save invalidates the cache.
- **No `subdivision` column on `tempo_ladder_progress`.** Subdivision is metronome state, ephemeral, not persisted.

## Adding a new route file

Expo-router 6 sometimes does not detect a brand-new file under `app/` until Metro is restarted. Symptom: navigating to the URL renders the bare path (e.g. `piece/[id]/click-up`) as text instead of the screen. Fix: tell the user to **Ctrl+C** the dev server and run `playweb` again. HMR-only edits to existing files don't have this issue.

## iPad references for porting

`reference-screenshots/ipad/<route>.png` (and `<route>-state.png` for screens with multiple states) captures the iPad ground truth. Workflow: ask the user for one fresh screenshot per port, drop into the convention path, then read/diff after the port. Convention names already in tree: `library-log`, `library-add-modal`, `upload`, `multi-page-preview1..6`, `tempo-ladder-{setup,practice}`, `click-up-{marking,setup,practice}`, `piece-history`, `rhythm-1`/`rhythm-2`/`rhythm-3` (Rhythmic Variation).

## Deploy

- Hosted on Vercel, auto-deploys on push to `master`.
- Public domain: `playfastnotes.com`.
- Build command: `npx expo export -p web` → output dir: `dist`.
- Env vars in Vercel project settings: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Auth redirect URLs configured in Supabase Auth → URL Configuration. For local dev: add `http://localhost:8081/**` to the **Redirect URLs** allowlist (the wildcard pattern). Site URL should be the bare domain (`http://localhost:8081` for local, `https://playfastnotes.com` for production).

## Don'ts

- **Don't edit the iPad repo** (`../learn-fast-notes/`) from this repo's tasks. The roadmap forbids cross-coupling. Read-only references are fine.
- **Don't add native-only deps** (`expo-haptics` no-ops are OK; `react-native-document-scanner-plugin`, `expo-audio` recording, etc. are not). Web is the goal here.
- **Don't change `slug` in `app.json`** without coordinating — Vercel/Supabase config keys off the project identity.

## Source of truth for product context

`../learn-fast-notes/ROADMAP.md` is the single source of truth for vocabulary, design principles, and execution phasing. Read it before making product decisions in this repo.
