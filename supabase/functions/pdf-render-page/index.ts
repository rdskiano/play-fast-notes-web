// pdf-render-page — Phase 1 de-risk experiment
//
// Receives a PDF as the request body (application/pdf) plus a `page` query param.
// Renders that single page with @hyzyla/pdfium (WASM PDFium) and returns it as a JPG.
//
// We render one page per invocation because Supabase Edge Functions cap CPU at 2s
// per request. Parallel single-page calls beat one big serial render.
//
// De-risk goals:
//   1. Confirm @hyzyla/pdfium imports + initializes in Deno via npm: specifier.
//   2. Confirm rendering a real-world page (Mahler 9 orchestral score) finishes
//      under the 2s CPU budget.
//   3. Confirm we can encode the bitmap to JPG without a native canvas.

import { PDFiumLibrary } from "npm:@hyzyla/pdfium@2.1.5";
import { encode as encodeJpeg } from "npm:@jsquash/jpeg@1.5.0";

Deno.serve(async (req) => {
  const t0 = performance.now();

  if (req.method !== "POST") {
    return new Response("POST a PDF body with ?page=<n>", { status: 405 });
  }

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const dpiScale = parseFloat(url.searchParams.get("scale") ?? "2"); // 2 ≈ ~1600px wide on US Letter
  const quality = parseInt(url.searchParams.get("quality") ?? "85", 10);

  if (!Number.isInteger(page) || page < 1) {
    return new Response("page must be a positive integer (1-indexed)", { status: 400 });
  }

  const pdfBytes = new Uint8Array(await req.arrayBuffer());
  if (pdfBytes.length === 0) {
    return new Response("empty body — POST the PDF as application/pdf", { status: 400 });
  }

  const tLoad = performance.now();

  let lib: Awaited<ReturnType<typeof PDFiumLibrary.init>> | null = null;
  let doc: Awaited<ReturnType<NonNullable<typeof lib>["loadDocument"]>> | null = null;

  try {
    lib = await PDFiumLibrary.init();
    doc = await lib.loadDocument(pdfBytes);

    const pageCount = doc.getPageCount();
    if (page > pageCount) {
      return new Response(
        JSON.stringify({ error: `page ${page} out of range (1..${pageCount})`, page_count: pageCount }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    const tInit = performance.now();

    const pdfPage = doc.getPage(page - 1);
    const rendered = await pdfPage.render({
      scale: dpiScale,
      render: "bitmap",
    });

    const tRender = performance.now();

    const expectedRgbaBytes = rendered.width * rendered.height * 4;
    const dataView = new Uint8ClampedArray(
      rendered.data.buffer,
      rendered.data.byteOffset,
      rendered.data.byteLength,
    );

    const jpeg = await encodeJpeg(
      { data: dataView, width: rendered.width, height: rendered.height },
      { quality },
    );

    const tEncode = performance.now();

    const meta = {
      page,
      page_count: pageCount,
      width: rendered.width,
      height: rendered.height,
      bitmap_bytes: rendered.data.byteLength,
      bitmap_expected_rgba: expectedRgbaBytes,
      bitmap_match: rendered.data.byteLength === expectedRgbaBytes,
      jpeg_bytes: jpeg.byteLength,
      timings_ms: {
        body_read: Math.round(tLoad - t0),
        pdfium_init_and_load: Math.round(tInit - tLoad),
        render: Math.round(tRender - tInit),
        encode: Math.round(tEncode - tRender),
        total: Math.round(tEncode - t0),
      },
    };

    return new Response(jpeg, {
      headers: {
        "content-type": "image/jpeg",
        "x-render-meta": JSON.stringify(meta),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return new Response(
      JSON.stringify({ error: message, stack, elapsed_ms: Math.round(performance.now() - t0) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  } finally {
    try { doc?.destroy(); } catch { /* ignore */ }
    try { lib?.destroy(); } catch { /* ignore */ }
  }
});
