// imslp-search — proxy IMSLP's MediaWiki search API.
//
// IMSLP's api.php is CORS-blocked for browsers, so the web app can't call it
// directly; this function does. It ONLY hits api.php (search/metadata), which
// IMSLP's robots.txt permits — it never bot-fetches the gated Special: download
// pages (that handoff is the user's job, in their browser). Respect IMSLP:
// one request per user search, a descriptive User-Agent.
//
// POST { query: string }. Returns { results: [{ title, work, composer,
// pageUrl, snippet }] }. Auth: requires a Supabase JWT (verify_jwt = true) so
// it isn't an open proxy.

const CORS = {
  "access-control-allow-origin": "*",
  // Must include x-client-info (and the api-version header) — the supabase-js
  // browser client sends them, and a preflight that doesn't allow them fails
  // with "Failed to send a request to the Edge Function".
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// "Symphony No.5, Op.67 (Beethoven, Ludwig van)" → work + "Ludwig van Beethoven".
function splitTitle(raw: string): { work: string; composer: string | null } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return { work: raw, composer: null };
  const work = m[1].trim();
  const inside = m[2].trim();
  const comma = inside.indexOf(",");
  const composer =
    comma >= 0
      ? `${inside.slice(comma + 1).trim()} ${inside.slice(0, comma).trim()}`.trim()
      : inside;
  return { work, composer };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const { query } = (await req.json().catch(() => ({}))) as { query?: string };
    const q = (query ?? "").trim();
    if (q.length === 0) return json(200, { results: [] });

    const url =
      "https://imslp.org/api.php?action=query&list=search&srnamespace=0&srlimit=20&format=json&srsearch=" +
      encodeURIComponent(q);
    const res = await fetch(url, {
      headers: {
        // Identify the app per IMSLP etiquette.
        "User-Agent": "PlayFastNotes/1.0 (https://playfastnotes.com; rdskiano@gmail.com)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return json(502, { error: `IMSLP returned ${res.status}` });
    const data = await res.json();
    const hits: Array<{ title: string; snippet?: string }> =
      data?.query?.search ?? [];

    const results = hits.map((h) => {
      const { work, composer } = splitTitle(h.title);
      return {
        title: h.title,
        work,
        composer,
        snippet: h.snippet ? stripHtml(h.snippet) : "",
        pageUrl: "https://imslp.org/wiki/" + encodeURIComponent(h.title.replace(/ /g, "_")),
      };
    });

    return json(200, { results });
  } catch (e) {
    console.error("imslp-search failed", e);
    return json(500, { error: "internal error" });
  }
});
