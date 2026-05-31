// Renders one document page's image, resolving it on demand.
//
// For older documents the page carries a stored image_uri and this is just an
// <Image>. For "Stage 2" PDFs (no per-page JPEG stored), resolvePageImageUri
// renders the page from the original PDF in the browser and hands back a blob
// URL — so this component shows a brief spinner the first time a page is
// viewed, then the rendered score.
//
// `active` is the windowing gate. The document viewer / picker mount EVERY page
// of the ScrollView at once (no virtualization), so without this every page of
// a 50-page PDF would kick off a heavy on-demand render simultaneously. Callers
// pass active={true} only for the page in view and its immediate neighbors; an
// inactive page that hasn't rendered yet just shows a placeholder and does no
// work. Once a page resolves we keep its URL (we don't clear it when it scrolls
// out of the window) so scrolling back is instant.
//
// The wrapper fills `style` and the image is absolutely positioned inside it,
// so the page occupies exactly the same box whether the image is ready or
// still rendering. That keeps PageBoxOverlay's letterbox math (which is driven
// by the slot dimensions + page w/h, not the image) aligned at all times.

import { Image, type ImageContentFit, type ImageContentPosition } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ResolvableDoc, ResolvablePage } from '@/lib/pdf/pageImage';
import { resolvePageImageUri } from '@/lib/pdf/pageImage';

export function DocumentPageImage({
  doc,
  page,
  style,
  contentFit = 'contain',
  contentPosition,
  active = true,
}: {
  doc: ResolvableDoc;
  page: ResolvablePage;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  contentPosition?: ImageContentPosition;
  /** When false, an as-yet-unrendered page stays a placeholder and does no
   *  rendering work. Pages with a stored image_uri ignore this (no work to do).
   *  Defaults to true for callers that window their own list (e.g. FlatList). */
  active?: boolean;
}) {
  const [uri, setUri] = useState<string | null>(page.image_uri ?? null);

  useEffect(() => {
    // Nothing to do once we have a URL (stored image_uri or a prior render).
    if (uri) return;
    // Off-screen pages wait until they scroll into the active window.
    if (!active) return;
    let cancelled = false;
    resolvePageImageUri(doc, page)
      .then((resolved) => {
        if (!cancelled && resolved) setUri(resolved);
      })
      .catch(() => {
        // Leave the placeholder up; a later activation retries.
      });
    return () => {
      cancelled = true;
    };
  }, [active, uri, doc, doc.id, doc.original_uri, page, page.index, page.image_uri]);

  return (
    <View style={style}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          contentPosition={contentPosition}
        />
      ) : active ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
