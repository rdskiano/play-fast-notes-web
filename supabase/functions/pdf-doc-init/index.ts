// pdf-doc-init — opens a PDF and reports {page_count, page_sizes}
//
// Pure metadata read: no rendering, no encoding. Fits comfortably under the 2s
// CPU budget for any reasonable PDF. Two call modes mirroring pdf-render-page:
//
//   1. Storage mode:  POST JSON {docId}
//      Reads <userId>/documents/<docId>/original.pdf from the pieces bucket.
//
//   2. Body mode:     POST application/pdf body
//      Reads the PDF from the request body. No storage I/O.
//
// page_sizes are in PDF points (1/72 inch). Clients multiply by the rendering
// scale to compute pixel placeholder dimensions before pdf-render-page returns.

import { PDFiumLibrary } from "npm:@hyzyla/pdfium@2.1.5";
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
      const pdfBytes = new Uint8Array(await req.arrayBuffer());
      if (pdfBytes.length === 0) return jsonError(400, "empty body — POST the PDF as application/pdf");
      return jsonOk(await readMetadata(pdfBytes));
    }

    if (contentType.includes("application/json")) {
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

      let body: { docId?: unknown };
      try {
        body = await req.json();
      } catch {
        return jsonError(400, "request body must be valid JSON");
      }
      const docId = typeof body.docId === "string" ? body.docId : null;
      if (!docId) return jsonError(400, "body must be {docId: string}");

      const pdfPath = `${userId}/documents/${docId}/original.pdf`;
      const { data: pdfBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(pdfPath);
      if (dlErr || !pdfBlob) {
        return jsonError(404, "could not download source PDF", { path: pdfPath, detail: dlErr?.message });
      }
      const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      return jsonOk(await readMetadata(pdfBytes));
    }

    return jsonError(400, "content-type must be application/pdf (body) or application/json (storage)");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return jsonError(500, message, { stack });
  }
});

async function readMetadata(pdfBytes: Uint8Array): Promise<{
  page_count: number;
  page_sizes: { width: number; height: number }[];
}> {
  const lib = await PDFiumLibrary.init();
  let doc;
  try {
    doc = await lib.loadDocument(pdfBytes);
    const pageCount = doc.getPageCount();
    const sizes: { width: number; height: number }[] = [];
    for (let i = 0; i < pageCount; i++) {
      const p = doc.getPage(i);
      const { width, height } = p.getSize();
      sizes.push({ width, height });
    }
    return { page_count: pageCount, page_sizes: sizes };
  } finally {
    try { doc?.destroy(); } catch { /* ignore */ }
    try { lib.destroy(); } catch { /* ignore */ }
  }
}

function jsonOk(payload: object): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
