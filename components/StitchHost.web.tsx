// Web shim: stitching on web uses the Canvas-based stitchVerticallyUris in
// lib/image/canvasCrop.web.ts directly, so no host surface is needed.
// <StitchHost /> renders nothing. stitchOnHost is not exported because no
// web caller imports it.

export function StitchHost() {
  return null;
}
