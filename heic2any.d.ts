// heic2any ships no TypeScript types. Minimal declaration for the bits we use:
// decode a HEIC/HEIF Blob to a JPEG/PNG Blob in the browser (libheif WASM).
// Only imported (dynamically) from web-only code (app/upload.web.tsx).
declare module 'heic2any' {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }
  export default function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;
}
