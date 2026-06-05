# Cross-device sync plan — iPad ⇄ iPhone ⇄ web

Status: **PLAN / not started.** Written 2026-06-05. Decisions captured from the
user (a musician, not a developer) are marked **[DECIDED]**; things still to
confirm are marked **[OPEN]**.

---

## 1. The goal, in plain language

Today the **website** keeps your library in the cloud, so any browser you log
into shows the same thing. But the **iPhone and iPad each keep their own private
copy** on the device and don't talk to each other or the web. The goal: make all
three converge, **and keep working with no internet** (a dead-wifi practice room),
syncing up whenever you're back online.

**Decision — offline matters [DECIDED]:** local-first. Each device keeps a usable
local copy; changes sync both ways in the background.

---

## 2. Scope decisions that make this much smaller

- **[DECIDED] Recordings do NOT sync.** They stay on the device that made them.
  This removes the single largest, most expensive piece of file-syncing.
- **[DECIDED] Heavy files load on demand ("lazy").** Sync the lightweight catalog
  everywhere — folder/piece/passage names, composers, PDF titles, page counts,
  practice history, progress. The actual **sheet-music image / PDF page** for a
  passage is only downloaded **when you open that passage to practice it on that
  device**, then cached locally. You never carry images for music you don't touch
  on a given device.
- **[DECIDED] Conflict rule: newest edit wins, per item.** If you edit the same
  passage on two devices while offline, the more recent change wins when they
  reconnect. Real conflicts are rare for one person; per-row last-write-wins is
  simple and predictable. (We already stamp `updated_at` on every row.)

---

## 3. The good news — most of the bookkeeping already exists

Verified in `lib/db/schema.ts` (native SQLite) and `db/schema.sql` (Supabase):

- The main tables (`pieces`/passages, `folders`, `documents`, `exercises`) already
  carry **`created_at`, `updated_at`, and `deleted_at`** on **both** platforms.
  `updated_at` is what powers "newest wins"; `deleted_at` (soft delete) is what
  lets a deletion travel to other devices instead of silently reappearing. This
  is normally the hard part to retrofit — it's already here.
- **IDs already match across platforms.** Both web (`*.web.ts`) and native
  (`*.ts`) mint IDs with the identical scheme `f_${Date.now()}_${random}`
  (`folders.ts` and `folders.web.ts` are byte-for-byte the same `newId()`), and
  Supabase's `id` columns are plain `text` — so native IDs already fit in the
  cloud. The earlier worry about "two labeling systems" was unfounded.
- Supabase is already **per-user** (every table has `user_id` + Row-Level
  Security), so a signed-in device only ever sees its own data.

So the schema is ~80% sync-ready.

---

## 4. Groundwork (Phase 1) — the real prerequisites

1. **Sign-in on iPhone/iPad.** Native today has no login (`_layout.tsx` runs a
   web-only auth gate; native just opens local SQLite). We add the same Supabase
   sign-in on native so the device knows whose library to sync. The Supabase
   client already exists on native (used by the `/import-supabase` dev route).
   - **[DECIDED] Keep a no-account, local-only mode.** Don't force login; sync is
     an opt-in benefit you get by signing in.
2. **Fix the practice log's IDs.** `practice_log` is the one exception: native
   uses `INTEGER AUTOINCREMENT` (each device numbers 1,2,3… → collisions). Switch
   it to a client-generated text ID like every other table, on both platforms,
   with a migration that re-IDs existing rows.
3. **Per-row sync metadata.** Add (where missing) a lightweight "dirty since last
   sync" marker so the engine knows what to push. Options: a `synced_at` column
   per table, or a small local `outbox` change-log table. Recommended: an
   `outbox` table (one place to read pending changes; survives crashes).
4. **Audit `updated_at`/`deleted_at` coverage.** A few small tables
   (`sessions`, `strategy_last_used`, the per-exercise `*_progress` tables) need a
   confirm/patch so they carry what the engine needs.

Phase 1 is invisible to you but unlocks everything.

---

## 5. The sync engine (Phase 2) — the library + history

A modest, hand-rolled engine (no new paid service — see §9). Per table, when
online:

- **PUSH:** send local rows changed since the last sync (from the outbox) up to
  Supabase. Each row carries its `updated_at`; Supabase keeps the newer one.
- **PULL:** fetch rows from Supabase changed since our last "watermark"
  (`updated_at > lastPulledAt`), write them into local SQLite, newest-wins.
- **Deletes** travel as `deleted_at` being set (tombstone), not as real deletes,
  so they propagate. (We already filter `deleted_at IS NULL` everywhere.)
- **When it runs:** on app foreground, after local writes (debounced), and on a
  light timer while active. All best-effort; failures just retry next time.
- **Watermark + outbox** live in the local `settings`/`outbox` tables.

After Phase 2, your **library structure, passage/PDF names, practice history, and
progress stay in sync across iPad/iPhone/web.** Still no heavy images moving yet.

Tables in scope: `folders`, `pieces`, `documents`, `exercises`, `practice_log`,
`tempo_ladder_progress`, `click_up_progress`, `strategy_last_used`,
`custom_patterns` (Supabase-only today), selected `settings`.
- **[DECIDED] `settings`:** sync user-level keys (timer configs) but NOT
  device-local ones (e.g. "don't show the install prompt"). Build an allowlist of
  which keys sync; default unknown keys to device-local (safer).
- `subscriptions` (Stripe) is **pull-only** — the server owns it.

---

## 6. Files / assets (Phase 3) — lazy, and trimmed

Assets live in one Supabase Storage bucket (`pieces`) as public URLs on web;
on native they're local `file://` paths today (`persistPassageImage.ts`).

- **Sheet-music images + PDF source/page renders:** on-demand. The synced row
  already names the asset; the first time you open that passage to practice on a
  device, fetch the file from Supabase Storage (uploading it there first if this
  device is the one that created it and it isn't in the cloud yet), then cache
  locally. PDFs already render per-page on demand, which fits this model well.
- **[DECIDED] Recordings: not synced.** Stay device-local.
- **[DECIDED] Annotations (pencil marks) DO sync across devices.** Two parts: a
  small vector blob (PencilKit data) + a flattened PNG. Plan: sync the **small
  vector blob** with the catalog so marks appear on every device, and
  lazy-download (or regenerate) the PNG. **TODO:** confirm/add a Supabase table
  for annotations — none was found in `db/schema.sql`, so the cloud side may need
  a table + the `annotations.web.ts` repo wired to it. Folded into Phase 3.

A device that created an asset must **upload it once** so other devices can pull
it; that upload can piggyback on the first sync after creation.

---

## 7. Phases & deliverables

- **Phase 1 — Foundation.** Native sign-in (opt-in) · practice_log ID fix +
  migration · outbox + watermark plumbing · `updated_at`/`deleted_at` audit.
  *(Invisible; no sync yet.)*
- **Phase 2 — Catalog + history sync.** The push/pull engine for all text data.
  *Deliverable: library + practice history + progress stay in sync across
  iPad/iPhone/web, online or (queued) offline.*
- **Phase 3 — Lazy assets.** On-demand image/PDF download + cache; first-time
  upload of device-created assets. *Deliverable: open a passage on any device and
  its music appears.*
- Annotations are synced as part of Phase 3 (vector blob + lazy PNG).
- Recordings: intentionally never synced.

Each phase is shippable on its own (and rides our normal OTA updates).

---

## 8. What can go wrong (and the guardrails)

- **Duplicate/echo on first sync** for a device that already did the one-shot
  `/import-supabase`: dedupe by ID (IDs match across platforms, so the same row
  merges instead of doubling). The old import path becomes a no-op once real sync
  exists.
- **Clock skew** affecting "newest wins": use server time (Supabase) as the
  authority for the pull watermark, not the device clock.
- **Half-finished syncs / offline edits:** the outbox makes push idempotent and
  resumable.
- **Storage cost / egress:** kept low by excluding recordings and lazy-loading
  images. Worth a rough cost estimate before Phase 3.

---

## 9. Build approach — recommendation

**Hand-rolled incremental sync (recommended).** The repo already has *both* a
local (SQLite) and cloud (Supabase) data layer with identical function
signatures, soft deletes, matching IDs, and `updated_at` — i.e. the hard
foundations of a sync engine are already laid. A per-table push/pull engine is a
moderate, well-understood amount of code, adds **no new paid service**, and fits
the existing structure.

**Alternative considered: PowerSync** (a hosted Postgres⇄SQLite sync service for
React Native). It would hand us the relational engine, but: it adds a paid
dependency, partially replaces the local DB layer, and **still doesn't handle the
asset/lazy-image piece** (we'd build that either way). Given recordings are
excluded and images are lazy, PowerSync's main value-add shrinks. Revisit only if
hand-rolled sync proves flaky at scale.

---

## 10. Decisions — all resolved (2026-06-05)

1. **[DECIDED]** Keep a no-account **local-only mode**; sync is opt-in on sign-in.
2. **[DECIDED]** **Annotations sync** across devices (Phase 3, vector + lazy PNG).
3. **[DECIDED]** **Settings**: sync user-level keys, keep device-local ones local
   (allowlist; unknown keys default to local).
4. **Storage budget: user unsure → adopt this default policy.** Recordings
   excluded + images lazy-loaded already keeps it small (sheet-music crops are
   ~0.1–0.5 MB; a heavy library is tens-to-low-hundreds of MB total — within
   Supabase's standard tiers). **Default:** keep cloud assets indefinitely; cache
   on-device with no eviction at first; add a simple "evict least-recently-opened
   images when the local cache exceeds N MB" only if devices actually fill up.
   Re-estimate real numbers before Phase 3 ships.

**→ All four resolved. Ready to start Phase 1 on the user's go-ahead.**
