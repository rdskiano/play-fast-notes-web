// pdf-render-page — Phase 1 production
//
// Renders one page of a PDF with @hyzyla/pdfium WASM, encodes to JPEG with
// @jsquash/jpeg. Two call modes:
//
//   1. Storage mode (production):  POST JSON {docId, page, scale?, quality?}
//      Reads <userId>/documents/<docId>/original.pdf from the pieces bucket,
//      renders the page, writes JPG to <userId>/documents/<docId>/p<page>.jpg,
//      returns {image_uri, width, height, page, timings_ms}. Authenticates as
//      the calling user; storage RLS enforces ownership.
//
//   2. Body mode (testing / de-risk):  POST application/pdf body + ?page=N
//      Renders the page, returns the JPG bytes inline. No storage I/O. Useful
//      for one-off curl smoke tests with the anon key.
//
// One page per invocation because Supabase Edge Functions cap CPU at 2s per
// request. Clients fan out N parallel calls.

import { PDFiumLibrary } from "npm:@hyzyla/pdfium@2.1.5";
import { encode as encodeJpeg } from "npm:@jsquash/jpeg@1.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const BUCKET = "pieces";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, apikey",
        "access-control-allow-methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return jsonError(405, "method not allowed");
  }

  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/pdf")) {
      return await handleBodyMode(req);
    }
    if (contentType.includes("application/json")) {
      return await handleStorageMode(req);
    }
    return jsonError(400, "content-type must be application/pdf (body mode) or application/json (storage mode)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return jsonError(500, message, { stack });
  }
});

async function handleBodyMode(req: Request): Promise<Response> {
  const t0 = performance.now();
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const scale = parseFloat(url.searchParams.get("scale") ?? "2");
  const quality = parseInt(url.searchParams.get("quality") ?? "85", 10);

  if (!Number.isInteger(page) || page < 1) {
    return jsonError(400, "page must be a positive integer (1-indexed)");
  }

  const pdfBytes = new Uint8Array(await req.arrayBuffer());
  if (pdfBytes.length === 0) {
    return jsonError(400, "empty body — POST the PDF as application/pdf");
  }

  const tLoaded = performance.now();
  const { rendered, pageCount, releasedAt } = await renderOnePage(pdfBytes, page, scale);
  if (page > pageCount) {
    return jsonError(400, `page ${page} out of range (1..${pageCount})`, { page_count: pageCount });
  }
  const jpeg = await encodeJpeg(
    {
      data: new Uint8ClampedArray(rendered.data.buffer, rendered.data.byteOffset, rendered.data.byteLength),
      width: rendered.width,
      height: rendered.height,
    },
    { quality },
  );
  const tEncoded = performance.now();

  const meta = {
    page,
    page_count: pageCount,
    width: rendered.width,
    height: rendered.height,
    jpeg_bytes: jpeg.byteLength,
    timings_ms: {
      body_read: Math.round(tLoaded - t0),
      render_and_pdfium: Math.round(releasedAt - tLoaded),
      encode: Math.round(tEncoded - releasedAt),
      total: Math.round(tEncoded - t0),
    },
  };

  return new Response(jpeg, {
    headers: {
      "content-type": "image/jpeg",
      "x-render-meta": JSON.stringify(meta),
      "access-control-allow-origin": "*",
    },
  });
}

async function handleStorageMode(req: Request): Promise<Response> {
  const t0 = performance.now();
  const auth = req.headers.get("authorization") ?? "";
  if (!auth) return jsonError(401, "missing authorization header");

  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonError(401, "unauthenticated", { detail: userError?.message });
  }
  const userId = userData.user.id;

  let body: { docId?: unknown; page?: unknown; scale?: unknown; quality?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "request body must be valid JSON");
  }
  const docId = typeof body.docId === "string" ? body.docId : null;
  const page = typeof body.page === "number" ? body.page : null;
  const scale = typeof body.scale === "number" ? body.scale : 2;
  const quality = typeof body.quality === "number" ? body.quality : 85;

  if (!docId || page === null || !Number.isInteger(page) || page < 1) {
    return jsonError(400, "body must be {docId: string, page: int>=1, scale?, quality?}");
  }

  const pdfPath = `${userId}/documents/${docId}/original.pdf`;
  const { data: pdfBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(pdfPath);
  if (dlErr || !pdfBlob) {
    return jsonError(404, "could not download source PDF", { path: pdfPath, detail: dlErr?.message });
  }
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const tDownloaded = performance.now();

  const { rendered, pageCount, releasedAt } = await renderOnePage(pdfBytes, page, scale);
  if (page > pageCount) {
    return jsonError(400, `page ${page} out of range (1..${pageCount})`, { page_count: pageCount });
  }
  const jpeg = await encodeJpeg(
    {
      data: new Uint8ClampedArray(rendered.data.buffer, rendered.data.byteOffset, rendered.data.byteLength),
      width: rendered.width,
      height: rendered.height,
    },
    { quality },
  );
  const tEncoded = performance.now();

  const jpgPath = `${userId}/documents/${docId}/p${page}.jpg`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(jpgPath, jpeg, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (upErr) {
    return jsonError(500, "could not upload rendered page", { path: jpgPath, detail: upErr.message });
  }
  const tUploaded = performance.now();

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(jpgPath);
  // Version-stamp like the existing storage helper does so re-renders bust caches.
  const image_uri = `${pub.publicUrl}?v=${Date.now()}`;

  return new Response(
    JSON.stringify({
      image_uri,
      width: rendered.width,
      height: rendered.height,
      page,
      page_count: pageCount,
      jpeg_bytes: jpeg.byteLength,
      timings_ms: {
        download: Math.round(tDownloaded - t0),
        render_and_pdfium: Math.round(releasedAt - tDownloaded),
        encode: Math.round(tEncoded - releasedAt),
        upload: Math.round(tUploaded - tEncoded),
        total: Math.round(tUploaded - t0),
      },
    }),
    { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } },
  );
}

async function renderOnePage(
  pdfBytes: Uint8Array,
  page: number,
  scale: number,
): Promise<{ rendered: { data: Uint8Array; width: number; height: number }; pageCount: number; releasedAt: number }> {
  const lib = await PDFiumLibrary.init();
  let doc;
  try {
    doc = await lib.loadDocument(pdfBytes);
    const pageCount = doc.getPageCount();
    if (page > pageCount) {
      return {
        rendered: { data: new Uint8Array(0), width: 0, height: 0 },
        pageCount,
        releasedAt: performance.now(),
      };
    }
    const pdfPage = doc.getPage(page - 1);
    const rendered = await pdfPage.render({ scale, render: "bitmap" });
    const releasedAt = performance.now();
    return { rendered, pageCount, releasedAt };
  } finally {
    try { doc?.destroy(); } catch { /* ignore */ }
    try { lib.destroy(); } catch { /* ignore */ }
  }
}

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
