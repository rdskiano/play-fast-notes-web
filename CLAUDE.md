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

### Recordings bucket (Self-Led Recording strategy)

Self-Led `recording` entries store an audio clip in a separate `recordings` bucket. Same one-time setup pattern as `pieces`:

1. Dashboard → Storage → "New bucket". Name it exactly `recordings` (lowercase). Leave "Public bucket" OFF — the SQL below grants public read so an inline `<audio>` tag can stream without juggling auth headers.
2. Dashboard → SQL Editor → paste and run:

```sql
drop policy if exists "recordings_public_read" on storage.objects;
create policy "recordings_public_read"
on storage.objects for select to public
using (bucket_id = 'recordings');

drop policy if exists "recordings_owner_insert" on storage.objects;
create policy "recordings_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'recordings'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "recordings_owner_delete" on storage.objects;
create policy "recordings_owner_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'recordings' and auth.uid()::text = (storage.foldername(name))[1]);
```

Symptom of missing setup: clicking "Save & log" on the Recording screen fails with `new row violates row-level security policy`. Path scheme is `<user_id>/<recording_id>.webm`. `lib/supabase/recordings.ts` uses `upsert: false` (one recording per log entry; no overwrite path), so the update policy from the pieces bucket isn't needed here.

## Vocabulary: "passage" in TS, "pieces" in SQL

In Phase 0 (2026-05-03) the user-facing term and TS symbols were renamed `piece` → `passage` to match how musicians and teachers actually talk ("piece" = the whole work; "passage" = a section you drill). The **SQL table name stays `pieces`** because every FK column (`practice_log.piece_id`, `exercises.piece_id`, `strategy_last_used.piece_id`) and the Supabase storage bucket reference it; renaming the table would have been a multi-PR migration and was deferred.

Concretely:
- TS types: `Passage`, `NewPassage`. Functions: `getPassage`, `listPassages`, `insertPassage`, etc.
- SQL queries: `supabase.from('pieces')`, `select('piece_id, ...')` — these still say `pieces` / `piece_id`.
- File: `lib/db/repos/passages.ts` (header comment documents the SQL identity gap).
- Routes: `/passage/[id]/...`. Storage paths: `<userId>/<pieceId>.<ext>` — unchanged.

When you write a new repo function, name it on the TS side using `Passage` and only fall back to `piece` inside SQL strings. Don't try to "fix" any remaining `piece_id` reference inside `.from('pieces')` queries — those are SQL identifiers, not TS symbols.

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

- **PostgREST cannot infer FKs between `practice_log`, `pieces`, `exercises`, `folders`** in this project. Embedded joins (e.g. `practice_log?select=...,exercises(name)`) return `PGRST200` *or worse*: with `.eq('pieces.folder_id', ...)` chained off an embedded join the request silently returns zero rows instead of erroring (this bit `getPracticeLogForFolder` on first port — Folder Log appeared empty regardless of data). Workaround: fetch tables separately and join client-side via `Map<id, row>`. Every reader in `lib/db/repos/practiceLog.ts` (`getPracticeLogForLibrary`, `getPracticeLogForPiece`, `getPracticeLogForFolder`) uses this pattern — keep it that way.
- **Storage URLs need a cache-buster.** When a piece is re-cropped, the upsert path is the same (`<userId>/<pieceId>.<ext>`), so the public URL is identical. Browsers and the Supabase CDN serve the stale bytes. `lib/supabase/storage.ts` appends `?v=<Date.now()>` to the returned URL, and that goes into `pieces.source_uri` — every save invalidates the cache.
- **No `subdivision` column on `tempo_ladder_progress`.** Subdivision is metronome state, ephemeral, not persisted.

## Adding a new route file

Expo-router 6 sometimes does not detect a brand-new file under `app/` until Metro is restarted. Symptom: navigating to the URL renders the bare path (e.g. `piece/[id]/click-up`) as text instead of the screen. Fix: tell the user to **Ctrl+C** the dev server and run `playweb` again. HMR-only edits to existing files don't have this issue.

## PDF export

iPad uses `expo-print` to render Exercise Builder exercises into a PDF. The web equivalent lives in `lib/export/buildExerciseHtml.ts` (a direct copy of the iPad helper) plus a popup-window pipeline in `app/piece/[id]/rhythm-builder.tsx`'s `exportPdf()`:

1. Build a fresh standalone HTML document via `buildExerciseHtml(...)`. abcjs in that document renders each exercise at `staffwidth: 680` with `responsive: 'resize'` — sized for the printable area of a US-letter page (8.5" - 2 × 0.6" margins ≈ 700 px).
2. `window.open('', '_blank')` and `document.write(...)` the HTML. abcjs lays out fresh in that window, so measure wrapping is correct (a regression vs. trying to repurpose the on-screen abcjs SVGs, which were sized for the iPad viewport).
3. After ~700 ms (enough for abcjs to render every exercise), the popup auto-calls `window.print()`. The browser's print dialog has "Save as PDF" as a destination.

If the popup is blocked, the user gets a one-time browser bar to allow popups for the site. Browsers only open a popup when the call is synchronous in the click handler, so do not stick `await` calls before `window.open(...)`.

## Low-latency taps on RN Web Pressables

`Pressable` on React Native Web waits for full press recognition (touchstart → touchend / mousedown → mouseup) before firing `onPress`, which adds ~80–150 ms of perceived delay. For the piano keyboard in the Exercise Builder, that lag is felt as audible note-trigger latency. Switching to `onPressIn` (touchdown / mousedown) makes notes fire immediately. Use `onPressIn` on any Pressable that needs musician-grade response time; `onPress` is fine elsewhere.

## Exercise Builder structure

The Exercise Builder in `app/piece/[id]/rhythm-builder.tsx` has three phases — `setup`, `entry`, `generate` — driven by a `phase` state. Loading an exercise that already has saved pitches auto-routes to `generate`; new exercises start at `setup`. The entire phase state is persisted to `exercises.config_json` (debounced 400 ms) — `instrumentId`, `keyId`, `clefId`, `grouping`, `pitches`, `useSharps`. Pieces' `units_json` is unused by the rhythmic flow; it is reserved for Click-Up markers.

`exercises.config_json` is the persistence seam. There is no separate `rhythm_builder_config` table — everything is stuffed in there as JSON. Schema unchanged from iPad.

## Cross-screen session state (Serial Practice)

Most screens own their session state locally — fine, because the user does not navigate away mid-session. **Serial Practice in Timer mode is the exception**: the user taps a strategy launch button (Tempo Ladder / Click-Up / Rhythmic Variation) mid-session, which `router.push`es to that strategy's screen. The Serial Practice timer must keep ticking while away, and coming back must resume the same session.

The pattern lives in `lib/sessions/serialPractice.ts`:
- A module-level mutable `_state` object holds the entire timer-mode session (spots, currentIndex, secondsLeft, etc.).
- A module-level `setInterval` decrements `secondsLeft` every second. The interval lives outside any React component, so unmounting `/interleaved` does not stop it.
- `subscribe(cb)` / `getSnapshot()` form an external-store pair compatible with React's built-in `useSyncExternalStore`.
- `/interleaved` consumes via `useSyncExternalStore(subscribe, getSnapshot, () => null)`, so on remount it instantly re-renders from the live singleton — the user sees the time as if they never left.
- `clearSession()` is called on celebration / END to release the interval and reset state.

Mirror of iPad's `_activeSession` module-level pattern from `learn-fast-notes/hooks/useInterleavedSession.ts`. Reuse this pattern for any future flow where state must survive in-flight navigation. Consistency-mode Serial Practice keeps state local to the component because it does not navigate away mid-session — same screen for every Clean/Miss tap.

## iPad references for porting

`reference-screenshots/ipad/<route>.png` (and `<route>-state.png` for screens with multiple states) captures the iPad ground truth. Workflow: ask the user for one fresh screenshot per port, drop into the convention path, then read/diff after the port. Convention names already in tree: `library-log`, `library-add-modal`, `upload`, `multi-page-preview1..6`, `tempo-ladder-{setup,practice}`, `click-up-{marking,setup,practice}`, `piece-history`, `rhythm-1`/`rhythm-2`/`rhythm-3` (Rhythmic Variation).

## Deploy

- Hosted on Vercel, auto-deploys on push to `master`.
- Public domain: `playfastnotes.com`.
- Build command: `npx expo export -p web` → output dir: `dist`.
- Env vars in Vercel project settings: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `EXPO_PUBLIC_FORMSPREE_URL` is optional (a working endpoint is hard-coded as fallback in `FeedbackButton.tsx`).
- Auth redirect URLs configured in Supabase Auth → URL Configuration. For local dev: add `http://localhost:8081/**` to the **Redirect URLs** allowlist (the wildcard pattern). Site URL should be the bare domain (`http://localhost:8081` for local, `https://playfastnotes.com` for production).
- **`vercel.json` SPA rewrite** routes any path that is not a real static file (`_expo/*`, `assets/*`, `favicon.ico`, anything with a dot) to `/`, so deep links and reloads on `/library`, `/piece/[id]/...` etc. resolve to `index.html` instead of 404. Without this rule Vercel returns 404 for any URL that isn't a file on disk — Expo Web exports a single `index.html` and routes client-side.

## iOS Add-to-Home-Screen icon

iOS Safari ignores the standard favicon when adding a site as a home-screen shortcut and instead looks for `/apple-touch-icon.png` (180×180) at the site root. Without it, the shortcut shows the first letter of the page title on a generic gradient placeholder. The file lives in `public/apple-touch-icon.png` (Expo's `public/` directory is copied to the dist root on `expo export`). After updating, the user must **long-press → Remove Bookmark** on the existing shortcut and re-add via Share → Add to Home Screen — iOS won't refetch the icon for an already-created shortcut.

`public/apple-touch-icon-precomposed.png` is the same bytes under the legacy filename for older iOS fallback.

## Feedback button (Formspree)

`components/FeedbackButton.tsx` is a floating bottom-right "💬 Feedback" button mounted in `app/_layout.tsx` (signed-in branch only). Tap → modal with a textarea → POST to a Formspree endpoint with this JSON shape:

```json
{
  "email": "<signed-in user>",
  "userId": "<supabase auth.uid>",
  "feedback": "<textarea content>",
  "page": "<window.location.href>",
  "userAgent": "<navigator.userAgent>",
  "timestamp": "<ISO8601>"
}
```

The `email` field is the Formspree reply-to convention — hitting Reply in Gmail goes straight to the user. The endpoint defaults to `https://formspree.io/f/mjglgqve` (rdskiano@gmail.com inbox, free tier 50/month) and is overridable via `EXPO_PUBLIC_FORMSPREE_URL`.

**This is a deliberate web-only addition** — the iPad-parity rule normally forbids web-only UI, but the user explicitly opted in for the testing-phase feedback channel. Don't extrapolate this exception to other web-only controls.

## /import-seed dev tool

`app/import-seed.tsx` is a one-off route to load an iPad `seed-export.json` into Supabase for testing — drag-and-drop the JSON, optionally wipe existing data, runs `supabase.from(t).insert(rows)` per table in dependency order. Pieces with image bytes in `seed.files` get base64-decoded and uploaded to the `pieces` storage bucket; the row's `source_uri` / `thumbnail_uri` are rewritten to the public URL.

Important: the wipe step uses a per-table primary-key column (`TABLE_FILTERS` map) with `.neq(col, '__never__')` because **not every table has `updated_at` or `created_at`** — `settings`, `strategy_last_used`, and `practice_log` lack those columns, so a generic `.gte('updated_at', 0)` predicate silently throws and aborts the import. Use the per-table filter pattern.

The route is unlinked — reach it by typing `/import-seed` in the URL bar. Auth-gated via the same `useSession` shell as the rest of the app. Safe to leave deployed since RLS prevents cross-user contamination; but it's a power tool, not user-facing UI.

## Don'ts

- **Don't edit the iPad repo** (`../learn-fast-notes/`) from this repo's tasks. The roadmap forbids cross-coupling. Read-only references are fine.
- **Don't add native-only deps** (`expo-haptics` no-ops are OK; `react-native-document-scanner-plugin`, `expo-audio` recording, etc. are not). Web is the goal here.
- **Don't change `slug` in `app.json`** without coordinating — Vercel/Supabase config keys off the project identity.

## Source of truth for product context

`../learn-fast-notes/ROADMAP.md` is the single source of truth for vocabulary, design principles, and execution phasing. Read it before making product decisions in this repo.
