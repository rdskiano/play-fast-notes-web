// Headless "Add page" controller for the document viewer (web).
//
// Renders only a hidden <input type="file">; call trigger() (via ref) to open
// the picker. It's headless + mounted once at the viewer root so it survives the
// phone ⋯ menu closing after you tap "Add page" — a picker owned by the menu
// would unmount mid-pick and the chosen file would be lost.
//
// On pick: encode the photo to a page image at the document reference scale
// (same as first upload), upload it as the next page, append it to pages_json
// (page_count kept in step by replaceDocumentPages), and hand the new page list
// back so the viewer can show + jump to it. New pages always carry their own
// image_uri, so this works whether the document started as photos or a PDF.

import { forwardRef, useImperativeHandle, useRef } from 'react';

import type { DocumentPage } from '@/lib/db/repos/documents';
import { replaceDocumentPages } from '@/lib/db/repos/documents';
import { fileToPageImage } from '@/lib/image/fileToPageImage';
import { supabase } from '@/lib/supabase/client';
import { uploadDocumentPageImage } from '@/lib/supabase/storage';

export type AddPageHandle = { trigger: () => void };

type Props = {
  documentId: string;
  pages: DocumentPage[];
  onAdded: (pages: DocumentPage[]) => void;
  onBusyChange?: (busy: boolean) => void;
};

export const AddPageButton = forwardRef<AddPageHandle, Props>(function AddPageButton(
  { documentId, pages, onAdded, onBusyChange },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Read the freshest page list at pick time — this controller stays mounted
  // while `pages` changes underneath it.
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  useImperativeHandle(ref, () => ({ trigger: () => inputRef.current?.click() }), []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the user pick the same file again later
    if (!file) return;
    onBusyChange?.(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) throw new Error('Not signed in');
      const { blob, w, h } = await fileToPageImage(file);
      const current = pagesRef.current;
      const nextIndex = current.reduce((max, p) => Math.max(max, p.index), 0) + 1;
      const image_uri = await uploadDocumentPageImage(userId, documentId, nextIndex, blob);
      const next: DocumentPage[] = [...current, { index: nextIndex, image_uri, w, h }];
      await replaceDocumentPages(documentId, next);
      onAdded(next);
    } catch (err) {
      if (typeof window !== 'undefined') {
        window.alert(`Couldn't add that page: ${(err as Error).message}`);
      }
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      onChange={onFile}
      style={{ display: 'none' }}
    />
  );
});
