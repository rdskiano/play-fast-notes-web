// For a passage that is a cropped box of a PDF page, shows that PDF page's
// Apple Pencil annotation cropped to the passage's box — read-only. Renders
// nothing for standalone (non-document) passages. Drop it in the score's
// container, below the passage's own editable annotation.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { CroppedAnnotation } from '@/components/CroppedAnnotation';
import { getDocumentAnnotations } from '@/lib/db/repos/documentAnnotations';
import { getDocument, parsePages } from '@/lib/db/repos/documents';
import { parseRegions, type Passage } from '@/lib/db/repos/passages';

type Underlay = {
  imageUri: string;
  region: { x: number; y: number; w: number; h: number };
  pageW: number;
  pageH: number;
};

export function DocumentPageUnderlay({ passage }: { passage: Passage }) {
  const [underlay, setUnderlay] = useState<Underlay | null>(null);

  useFocusEffect(
    useCallback(() => {
      const docId = passage.document_id;
      const regions = parseRegions(passage.regions_json);
      // Only a single-region passage maps cleanly onto one page box.
      if (!docId || regions.length !== 1) {
        setUnderlay(null);
        return;
      }
      const region = regions[0];
      let cancelled = false;
      (async () => {
        try {
          const [doc, annotations] = await Promise.all([
            getDocument(docId),
            getDocumentAnnotations(docId),
          ]);
          if (cancelled) return;
          const pageAnnotation = annotations.get(region.page);
          const page = doc
            ? parsePages(doc.pages_json).find((p) => p.index === region.page)
            : undefined;
          if (!pageAnnotation?.imageUri || !page) {
            setUnderlay(null);
            return;
          }
          setUnderlay({
            imageUri: pageAnnotation.imageUri,
            region,
            pageW: page.w,
            pageH: page.h,
          });
        } catch {
          if (!cancelled) setUnderlay(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [passage.document_id, passage.regions_json]),
  );

  if (!underlay) return null;
  return <CroppedAnnotation {...underlay} />;
}
