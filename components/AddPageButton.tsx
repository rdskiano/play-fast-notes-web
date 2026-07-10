// Native stub of AddPageButton.web.tsx. Adding a page from a photo is a web-only
// flow today (native document ingestion goes through its own tooling), so this
// renders nothing and its trigger is a no-op. Keeps the shared import in
// app/document/[id].tsx resolving + type-checking on native.

import { forwardRef, useImperativeHandle } from 'react';

import type { DocumentPage } from '@/lib/db/repos/documents';

export type AddPageHandle = { trigger: () => void };

type Props = {
  documentId: string;
  pages: DocumentPage[];
  onAdded: (pages: DocumentPage[]) => void;
  onBusyChange?: (busy: boolean) => void;
};

export const AddPageButton = forwardRef<AddPageHandle, Props>(function AddPageButton(_props, ref) {
  useImperativeHandle(ref, () => ({ trigger: () => {} }), []);
  return null;
});
