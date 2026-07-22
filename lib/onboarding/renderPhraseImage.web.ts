// Render an ABC phrase to a PNG data URI (web), so the seeded Bumblebee piece
// shows its actual notation on the library card instead of a blank placeholder.
//
// abcjs draws music as self-contained SVG paths (no external fonts/images), so
// we render it off-screen, rasterize the SVG to a white-background PNG via
// canvas (PNG is the most reliable format for the Image component), and hand
// back a data URI. Best-effort: any failure returns null and the seed falls
// back to the placeholder card.

const INK = '#15191A';

type AbcjsApi = {
  renderAbc: (el: HTMLElement, abc: string, opts?: Record<string, unknown>) => unknown;
};
declare global {
  interface Window {
    ABCJS?: AbcjsApi;
  }
}

// abcjs comes from the JS bundle (npm package), not a CDN — offline-safe.
// Same lazy-require pattern as AbcStaffView.web.tsx, shared via window.ABCJS.
async function ensureAbcjs(): Promise<AbcjsApi | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (window.ABCJS) return window.ABCJS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('abcjs') as AbcjsApi;
    window.ABCJS = mod;
    return mod;
  } catch {
    return null;
  }
}

function svgToPng(svgDataUri: string, width: number, height: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = 2; // render at 2× for a crisp card thumbnail
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = svgDataUri;
  });
}

export async function renderPhraseImage(abc: string): Promise<string | null> {
  const ABCJS = await ensureAbcjs();
  if (!ABCJS || typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = '880px';
  document.body.appendChild(host);
  try {
    ABCJS.renderAbc(host, abc, {
      staffwidth: 840,
      scale: 1.5,
      paddingleft: 8,
      paddingright: 8,
      paddingtop: 10,
      paddingbottom: 10,
    });
    const svg = host.querySelector('svg');
    if (!svg) return null;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Solid ink for notes + staff lines.
    svg.querySelectorAll('path').forEach((p) => {
      p.setAttribute('fill', INK);
      if (p.getAttribute('stroke') && p.getAttribute('stroke') !== 'none') {
        p.setAttribute('stroke', INK);
      }
    });
    const width = parseFloat(svg.getAttribute('width') ?? '880') || 880;
    const height = parseFloat(svg.getAttribute('height') ?? '160') || 160;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    return await svgToPng(svgUri, width, height);
  } catch {
    return null;
  } finally {
    document.body.removeChild(host);
  }
}
