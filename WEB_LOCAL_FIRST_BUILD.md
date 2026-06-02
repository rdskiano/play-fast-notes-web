# WEB_LOCAL_FIRST_BUILD

Self-contained spec for Claude Code Terminal. Read this file + `CLAUDE.md` + `ROADMAP.md`, then execute. iPad is untouched — this is a web-only build.

---

## Intent

The Supabase `Skiano Studio` org tripped the free-tier cached-egress quota on 2026-05-29 (8.17 GB against a 5.5 GB threshold) with 16 signed-up users and ~4 active. The Pro upgrade ($25/mo) covered the immediate ceiling, but the per-active-user egress trajectory makes the cap real around 125–500 active users depending on the swap stack. This build addresses egress on web — where it actually originates. iPad already runs on SQLite + on-device files and incurs near-zero Supabase storage egress in normal use.

Two phases, separable:

1. **Phase 1 — cache-bust removal.** `uploadPassageImage` and `uploadAnnotationImage` currently return `${publicUrl}?v=${Date.now()}` on every save. Every re-crop and every pencil-overlay save invalidates the CDN + browser cache. Swap the timestamp for a content hash so stable bytes ⇒ stable URL ⇒ effective CDN cache.

2. **Phase 2 — PWA service-worker cache for Supabase storage URLs.** Register a service worker that intercepts requests to `*.supabase.co/storage/v1/object/public/{pieces,recordings}/*` and serves them from IndexedDB after first fetch. Cache-first, immutable per URL (made safe by Phase 1's stable URLs).

Ship Phase 1 first. It can land in one PR. Phase 2 is the bigger piece.

---

## What this build is NOT

- Not an iPad change. The native repos (`lib/db/repos/*.ts`, no `.web` suffix) are already local-first; CLAUDE.md is explicit: *"The merged iOS app does NOT use Supabase by default."*
- Not a cross-device library-sync feature. iPad ↔ web sync via the manual `/import-supabase` route stays as designed.
- Not a recordings refactor. Recordings continue to upload to Supabase as the source of truth (so a recording made on iPad shows up in the web practice log per the existing comment in `lib/supabase/recordings.ts`). Phase 2 caches recording bytes after first playback; that's it.
- Not a database-storage change. DB is 14 MB and not the constraint.

---

## Constraints baked in (from this session's product decisions)

- **Web scope: PWA-installed users.** Service worker registers for everyone, but `navigator.storage.persist()` is requested so durable storage is real on iOS Safari PWAs. Non-PWA tabs still benefit from the SW cache; eviction is OS-discretionary.
- **iPad cache policy: never evict** (this codifies what iPad already does — `softDeletePassage` is the only path that removes files).
- **No new product feature visible to users.** This is infra. The friend-test pass that's queued next should feel identical except for "feels snappy on second open."

---

## Files to read first (Claude Code Terminal)

In this order:

1. `CLAUDE.md` (root) — repo conventions, especially the `.ts` / `.web.ts` platform-split rule and the active migration status. Note the warning against re-introducing `moduleSuffixes`.
2. `lib/supabase/storage.ts` — the four-function file that owns `pieces` bucket writes for passages and annotations.
3. `lib/supabase/recordings.ts` — `recordings` bucket writes + the `practice_log` row.
4. `lib/pdf/upload.ts` — multi-step PDF document orchestrator. Touches `pieces` bucket for `<userId>/documents/<docId>/original.pdf` plus per-page JPEGs written by the `pdf-render-page` edge function.
5. `lib/db/repos/passages.ts` — to confirm the `source_uri` round-trip on native (SQLite + file paths). Do not change anything in this file.
6. `lib/db/repos/passages.web.ts` and `lib/db/repos/documents.web.ts` — these store the Supabase URL in the `source_uri` column. The new content-hash URL flows through these unchanged (it's still a URL).
7. `app/+html.tsx` — the entry-point HTML. Service-worker registration goes here.
8. `public/manifest.webmanifest` — PWA manifest already shipped 2026-05-24. Confirm `start_url` and `scope` won't fight the service worker.

---

## Phase 1 — Cache-bust removal

**Goal:** Replace `?v=${Date.now()}` with `?v=<contentHash>` on the two cache-busted uploaders. Stable bytes ⇒ stable URL ⇒ CDN cache hits.

### Changes

**`lib/supabase/storage.ts`** — both upload functions.

Add a small helper:

```ts
async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

Update `uploadPassageImage`:

```ts
export async function uploadPassageImage(
  pieceId: string,
  file: File,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const ext = inferExt(file);
  const path = `${userId}/${pieceId}.${ext}`;

  // Hash the bytes before upload so the URL we return is content-addressed.
  // Stable bytes ⇒ stable URL ⇒ CDN + service-worker cache hits.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = (await sha1Hex(bytes)).slice(0, 12);

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${hash}`;
}
```

Update `uploadAnnotationImage`:

```ts
export async function uploadAnnotationImage(
  key: string,
  base64Png: string,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Not signed in');

  const path = `${userId}/${key}-annotation.png`;
  const bytes = base64ToBytes(base64Png);
  const hash = (await sha1Hex(bytes)).slice(0, 12);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      upsert: true,
      contentType: 'image/png',
    });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${hash}`;
}
```

### Why this works

The path is still `<userId>/<pieceId>.<ext>` (Supabase upsert overwrites at that path — RLS scope unchanged). The version param changes when and only when the bytes change. Browsers and the Supabase CDN treat `?v=abc` and `?v=def` as different URLs and cache each. The previous timestamp pattern made every save a unique URL even when the user just re-saved the same crop.

### Phase 1 test plan

1. `playweb`. Upload a passage. Crop it. Note the `source_uri` in the network tab: should end in a 12-char hex hash.
2. Re-crop the same passage with identical bytes (re-trigger the upload without changing anything). The `source_uri` should be byte-identical to the previous one (same hash).
3. Re-crop with a different rect. New bytes ⇒ new hash ⇒ different URL.
4. Confirm the displayed image updates correctly in case 3 (no stale cache).
5. Smoke pencil overlay: draw, save, redraw, save. Each distinct save should change the hash; redrawing the exact same overlay should not.

### Ship

`git push web-origin-archive master` after the smoke checks. Phase 1 is independent of Phase 2 and worth shipping alone.

---

## Phase 2 — PWA service-worker cache for Supabase storage

**Goal:** First fetch of any Supabase storage URL goes to network. Every subsequent fetch reads from IndexedDB. Works for PDFs, page JPEGs, passage images, pencil PNGs, recordings.

### Files to create

```
public/sw.js                          # the service worker (root scope)
lib/sw/registerServiceWorker.web.ts   # registers SW + requests persistent storage
lib/sw/registerServiceWorker.ts       # native no-op sibling
```

(The `.web.ts` / `.ts` split keeps native bundles from importing browser-only APIs. See CLAUDE.md "Platform-split file conventions" — do not deviate.)

### Files to change

```
app/+html.tsx                         # inject the SW registration <script>
public/manifest.webmanifest           # confirm scope/start_url; no expected change
```

### Service worker (`public/sw.js`)

Plain JS, no bundling. Live at the site root so its scope is `/`. Behavior:

- **Install:** `self.skipWaiting()`.
- **Activate:** `clients.claim()` so existing pages get covered without reload.
- **Fetch handler:** match `request.url` against `*.supabase.co/storage/v1/object/public/{pieces,recordings}/*`. For matches, run cache-first:
  1. Open IDB store `pfn-storage-cache-v1`.
  2. `cache.get(request.url)` — if hit, return `new Response(blob, { headers: { 'content-type': storedMime } })`.
  3. If miss, `fetch(request)`, on 200 clone into a blob, write `{ url, blob, mime, cachedAt }` to IDB, return original response.
  4. On network error with no cache, return a fall-through error response so the page handles it normally.

Skip non-GET requests. Skip URLs with query params other than `?v=<hash>` (preserves correctness if other callers ever pass signed-URL tokens). Use the URL **including** the `?v=<hash>` as the cache key — different hashes are different cache entries by design (Phase 1 guarantees this is correct).

No expiration logic. Phase 1 makes the URLs content-addressed; old `?v=<old-hash>` entries are eventually GC-pruned by the browser when IDB is under pressure. Add a manual purge in Phase 3 if real users hit storage limits.

Skeleton:

```js
// public/sw.js
const DB_NAME = 'pfn-storage-cache';
const STORE = 'objects';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (!/\.supabase\.co\/storage\/v1\/object\/public\/(pieces|recordings)\//.test(url)) return;

  e.respondWith(handle(e.request));
});

async function handle(request) {
  const url = request.url;
  const cached = await idbGet(url);
  if (cached) {
    return new Response(cached.blob, { headers: { 'content-type': cached.mime } });
  }
  try {
    const res = await fetch(request);
    if (!res.ok) return res;
    const blob = await res.clone().blob();
    const mime = res.headers.get('content-type') ?? 'application/octet-stream';
    idbPut(url, { blob, mime, cachedAt: Date.now() }).catch(() => {});
    return res;
  } catch (err) {
    return new Response('Network error and no cached copy', { status: 504 });
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
```

### Registration (`lib/sw/registerServiceWorker.web.ts`)

```ts
export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    // PWA-installed users get durable storage so eviction doesn't bite the
    // cache. Tab-only users see the same UX; the storage just isn't durable.
    if (navigator.storage?.persist) {
      try {
        await navigator.storage.persist();
      } catch {
        // Persist API can throw on some browsers; ignore.
      }
    }
  } catch (err) {
    console.warn('[sw] registration failed', err);
  }
}
```

Native sibling (`lib/sw/registerServiceWorker.ts`):

```ts
export async function registerServiceWorker(): Promise<void> {
  // No-op on native — service workers are a browser concept.
}
```

### Hook it up

In `app/+html.tsx`, add a `<script>` tag in the document that runs `navigator.serviceWorker.register('/sw.js')` on load — inline, not bundled, so the SW registers before the React tree mounts. Alternatively, call `registerServiceWorker()` from `app/_layout.tsx` inside a `useEffect` in the web branch — pick whichever the repo's `_layout` pattern already uses (CLAUDE.md notes `_layout.tsx` is `Platform.OS`-gated; either works).

### Phase 2 test plan

1. `playweb`. Open DevTools → Application → Service Workers. Reload. Confirm `sw.js` is `activated` and `running`.
2. Open a passage. Network tab: the image request should succeed (status `200` from `fetch`).
3. Reload. Same image request now shows `(ServiceWorker)` as the source.
4. Open a PDF document. First page render: network 200. Reload: SW.
5. Play a recording. First playback: network. Subsequent playbacks (same session, after reload): SW.
6. **Cross-tab smoke:** open a passage in tab A. Open the same passage in tab B (no reload between). Tab B should hit the SW cache without a network request.
7. **Cache-bust correctness:** re-crop a passage. New `?v=<hash>` ⇒ new URL ⇒ SW misses cache ⇒ fetches fresh bytes. Confirm the image visually updates.
8. **Offline:** put the browser in Offline mode (DevTools → Network → Offline). Open a previously-viewed passage. Should render from cache.
9. **Storage durability:** Application → Storage → confirm "Persistent" badge appears for the origin (iOS Safari PWA users specifically). On Chrome it's the "Persistent storage" indicator under Application → Storage.

### Ship

After Phase 1 lands and tests pass, `git push web-origin-archive master`. Friend-test on the live site — pay attention to whether the second open of any passage feels snappier than the first.

---

## Out of scope / follow-ups

- **Edge function output cache.** `pdf-render-page` writes JPEGs to storage; those are covered by the SW cache. The function execution itself isn't cached, but that's CPU, not egress.
- **Recordings on iPad.** They still upload to Supabase as today. The next session can ask whether iPad recordings should also be written to local FS as primary, with Supabase as backup. Not solved here.
- **Storage cleanup.** Old `?v=<old-hash>` entries accumulate in IDB across re-crops. Browsers GC under pressure, but a manual purge button in Settings would be belt-and-suspenders. Defer until a user reports it.
- **Friend-link previews for non-logged-in viewers.** Public share URLs (if and when added) still incur Supabase egress because non-users have no SW context. Out of scope.

---

## Quick reference — files this build touches

| Phase | File | Action |
|---|---|---|
| 1 | `lib/supabase/storage.ts` | Edit — add `sha1Hex` helper, swap `?v=${Date.now()}` for `?v=<hash>` in both uploaders |
| 2 | `public/sw.js` | Create — service worker |
| 2 | `lib/sw/registerServiceWorker.web.ts` | Create — web SW registration + persist request |
| 2 | `lib/sw/registerServiceWorker.ts` | Create — native no-op |
| 2 | `app/+html.tsx` or `app/_layout.tsx` | Edit — wire SW registration to web boot |

iPad is untouched. SQLite repos are untouched. The `lib/db/repos/*.ts` (native) layer is left alone — it's already local-first.

---

## Why this is the right cut

Working musicians who practice on web open the same passages dozens of times. Today every open is a CDN fetch (or worse, a fresh upload of an unchanged image because of the `?v=${Date.now()}` cache-bust). Stable URLs + a service-worker cache turn that into one network round-trip per object per device per cache lifetime. The Supabase trajectory math shifts from 8 GB/month at 16 users to roughly first-fetch only, with re-opens free. At your year-one target of 50–100 paying users, that's the difference between "the cap is irrelevant" and "the cap shapes the paid tier price."
