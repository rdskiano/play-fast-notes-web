// Play Fast Notes — Supabase storage cache (Phase 2 of WEB_LOCAL_FIRST_BUILD).
//
// Cache-first service worker for public Supabase storage objects (passage
// images, pencil-overlay PNGs, document PDFs + page JPEGs, recordings). First
// fetch goes to network; every subsequent fetch reads from IndexedDB. Phase 1
// made these URLs content-addressed (`?v=<sha1>`), so caching by full URL is
// safe — distinct bytes ⇒ distinct URL ⇒ distinct cache entry, and re-saving
// identical bytes reuses the cached copy.
//
// Two non-obvious things this does that a naive blob-cache wouldn't:
//   1. Upgrades the network fetch to CORS. <img>/<audio> issue *no-cors*
//      requests whose responses are opaque and unreadable, so a naive
//      `fetch(request).blob()` would cache 0 bytes. Supabase serves public
//      objects with `Access-Control-Allow-Origin: *`, so re-fetching with
//      `mode: 'cors'` yields a readable body we can store and re-serve.
//   2. Honors Range requests. <audio> playback (recordings) seeks via Range;
//      serving a full 200 from a cached blob breaks seeking in Safari — the
//      exact iOS-PWA audience here. We slice the cached blob into a 206.

const DB_NAME = 'pfn-storage-cache';
const STORE = 'objects';
const STORAGE_RE =
  /\.supabase\.co\/storage\/v1\/object\/public\/(pieces|recordings)\//;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (!STORAGE_RE.test(url)) return;

  // Only handle clean public URLs: no query string, or solely the `?v=<hash>`
  // cache key. Anything else (e.g. a signed-URL `token=`) is left to the
  // network so we never cache a credentialed or transient response.
  const params = new URL(url).searchParams;
  for (const key of params.keys()) {
    if (key !== 'v') return;
  }

  e.respondWith(handle(req));
});

async function handle(request) {
  const url = request.url;
  const range = request.headers.get('range');

  let cached = await idbGet(url);
  if (!cached) {
    try {
      // CORS GET so the body is readable (see header note #1). `?v=<hash>`
      // makes this immutable, so credentials are irrelevant — omit them.
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (res.status !== 200) return res;
      const blob = await res.blob();
      const mime = res.headers.get('content-type') ?? 'application/octet-stream';
      cached = { blob, mime, cachedAt: Date.now() };
      idbPut(url, cached).catch(() => {});
    } catch (err) {
      // CORS fetch failed (offline, or origin without ACAO). Fall back to the
      // ORIGINAL request so the page still gets its normal response on a miss.
      try {
        return await fetch(request);
      } catch {
        return new Response('Network error and no cached copy', { status: 504 });
      }
    }
  }

  return buildResponse(cached.blob, cached.mime, range);
}

// Serve a cached blob, honoring a Range header with a proper 206 so <audio>
// seeking works. No Range ⇒ a plain 200 with content-length + accept-ranges.
function buildResponse(blob, mime, range) {
  const size = blob.size;
  if (!range) {
    return new Response(blob, {
      status: 200,
      headers: {
        'content-type': mime,
        'content-length': String(size),
        'accept-ranges': 'bytes',
      },
    });
  }

  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${size}` },
    });
  }

  const slice = blob.slice(start, end + 1, mime);
  return new Response(slice, {
    status: 206,
    headers: {
      'content-type': mime,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': String(end - start + 1),
      'accept-ranges': 'bytes',
    },
  });
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
