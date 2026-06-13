# Community Rhythm Library — plan (Phase 1)

Status: **BUILT 2026-06-12** (tsc + web/ios exports clean; live click-through
pending; NOT pushed). The `community_exercises` table + RLS + the
`increment_community_download` RPC are already applied to the LIVE Supabase
project (an empty unused table until the code ships). Files: `db/schema.sql`,
`lib/community/{exercises,exerciseConfig,exerciseExport[.web]}.ts`,
`components/ShareExerciseModal.tsx`, `app/community.tsx`,
`app/community/[id].tsx`, plus wiring in `app/passage/[id]/rhythm-builder.tsx`
(a "Share" button on the generate-phase top bar, next to PDF — the natural
"I just finished an exercise" moment), `app/(tabs)/library.tsx` (My Library | Community
scope segments), `app/tools/index.tsx` (Community card), and route
registration in `app/_layout.tsx`. Decided + built 2026-06-12.

## What it is

A browsable, searchable shelf of **rhythm exercises**, presented as
view/download/print "PDFs," organized by instrument, repertoire type, and
contributor. It's the **shop window** for the Rhythm Builder: a non-paying
visitor browses great exercises and is enticed to upgrade to make/customize
their own.

- **Browsing/viewing/downloading: free** (the funnel).
- **Creating exercises (Rhythm Builder) + publishing to the library: Pro.**

Only rhythm exercises qualify — they're the one practice artifact that's both
fully portable AND copyright-clean (app-generated notation; no copyrighted
sheet music anywhere). Everything else waits for the IMSLP-anchored Phase 2.

Inspiration: a first-time user assumed the library search bar searched beyond
his own shelf. It should — My Library + Community now, IMSLP later.

## The copyright-safe rule (non-negotiable)

"Publish" is **one-tap export of YOUR OWN exercise**, never an arbitrary file
upload. The app produces the artifact from a real rhythm-builder config, so a
contributor can only ever share their own generated notation — never a scanned
copyrighted part. If we ever allow free-form PDF uploads, we reintroduce the
exact App-Store-removal / DMCA risk this whole design avoids. Don't.

## Implementation choice: store the CONFIG, render on demand

Rather than store binary PDF files, store the exercise's `config_json` +
metadata, and:
- **Browse/preview** renders the notation live in-app (reuse `AbcStaffView` /
  the rhythm renderer) — nicer than a PDF thumbnail, no file storage.
- **Download/print PDF** reuses the EXISTING branded export
  (`lib/export/buildExerciseHtml.ts`) on the viewer's device, producing the
  same logo + tagline + playfastnotes.com PDF — so every shared exercise is
  also a branded ad for the app.

From the user's seat this is still "a library of PDFs you can view and
download." It just skips headless PDF generation and binary storage, and keeps
the copyright rule trivially enforceable (you can only publish a real config).
(Storing config also leaves the door open to live-import-and-edit later without
re-architecting.)

A rhythm-builder exercise = `exercises` row, `strategy = 'rhythmic'`,
`config_json = { instrumentId, keyId, clefId, grouping, pitches, useSharps }`.
Self-contained; renders identically for anyone.

## Data model

Web/cloud only (native reaches it via the web Supabase client, like
recordings — no SQLite mirror).

```sql
create table if not exists community_exercises (
  id uuid primary key default gen_random_uuid(),
  contributor_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  contributor_name text not null,           -- handle picked on first publish, reused
  title text not null,
  config_json jsonb not null,               -- COPY of the rhythm-builder config
  instrument_id text,                       -- powers "browse by instrument"
  repertoire_type text,                     -- 'etude' | 'orchestral' | 'solo' | 'method' | 'other'
  piece_title text,                         -- optional "made for …" LABEL (text only, no score)
  composer text,                            -- optional
  time_signature text,                      -- denormalized for list display / filtering
  notes text,                               -- optional contributor blurb
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_community_exercises_instrument on community_exercises(instrument_id);
create index if not exists idx_community_exercises_reptype on community_exercises(repertoire_type);
alter table community_exercises enable row level security;
-- Anyone signed in may READ (browsing is free; the funnel).
create policy community_exercises_read on community_exercises for select using (true);
-- Only the contributor may write/edit/remove their own rows (publishing is Pro,
-- enforced in the app UI before this insert ever runs).
create policy community_exercises_owner_write on community_exercises
  for all using (auth.uid() = contributor_user_id) with check (auth.uid() = contributor_user_id);
```

`download_count` bump = a `security definer` RPC so non-owners can increment
without write access (or drop the counter from v1).

Contributor name: no profile system yet. Prompt on first publish, persist in
settings (`community.contributor_name`), reuse, editable.

## Files

- `lib/community/exercises.ts` — Supabase CRUD: `listCommunityExercises(filters)`,
  `searchCommunityExercises(q, filters)`, `publishExercise(...)`,
  `unpublishExercise(id)`, `myContributions()`, `incrementDownload(id)`. Same
  file on native (web Supabase client, like `lib/supabase/recordings.ts`).
- `app/community.tsx` — browse/search: instrument chips + repertoire chips +
  free-text on title/piece/composer/contributor. Rows: title · contributor ·
  instrument · time sig · "made for X".
- `app/community/[id].tsx` (or modal) — render the notation + "Download PDF"
  (existing export) + "made for" context label.
- `components/ShareExerciseModal.tsx` — collects title (prefilled), repertoire
  type, optional piece/composer/notes, contributor name → publish (Pro-gated).
- Publish entry point: a "Publish to community" action on a rhythm exercise in
  `app/passage/[id]/rhythm-list.tsx` and/or the rhythm-builder top bar.

## Search unification (the friend's insight)

`app/(tabs)/library.tsx` search gains a scope control: **My Library | Community**
(IMSLP = Phase-2 third tab). Same box; segments above the results route the
query to the local filter vs `searchCommunityExercises`.

## Pro-gating

- **Free:** browse, preview, download/print community exercise PDFs.
- **Pro:** the Rhythm Builder itself (create/customize exercises) and
  publishing to the community.

DONE (2026-06-12): the **Exercise Builder is now Pro-gated** — the "Exercise
Builder" button on the passage screen (`app/passage/[id]/index.tsx`) shows the
PaywallModal for non-Pro users. The sibling **"Rhythm patterns only" path
stays FREE** (the free taste). Gate is inert while `PAYWALL_ENABLED` is false.
The builder's only entry is that button, so one gate covers it. Community
"Publish" will reuse the same Pro check when built.

## Cold-start

Empty until filled; ~6 active users today. Seed with Ralph's own exercises,
recruit a few power users. Best surfaced AFTER the paid tier grows the base;
can be built earlier behind the dark paywall flag and seeded quietly.

## Phase 2 (deferred — needs IMSLP)

Anchor a submission to a specific public-domain IMSLP edition; everyone then
loads identical pages, so score-MARKINGS (click-up units, chaining problem
spots, chunking) become shareable too, legally. Adds IMSLP as the third search
scope. IMSLP has no clean public API → its own research/design pass.
