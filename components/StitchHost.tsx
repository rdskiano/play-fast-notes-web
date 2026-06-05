// Native multi-image vertical stitcher.
//
// expo-image-manipulator can crop/resize/rotate a single image but cannot
// composite multiple images into one. To produce the single JPEG that
// multi-page passages need on iOS, we render the source images stacked
// vertically into an off-screen <View> and use react-native-view-shot's
// captureRef() to flatten that view to a file.
//
// captureRef needs a mounted view in the React tree — it can't run from
// a plain utility function. So this file exposes both:
//   - `<StitchHost />`: a hidden surface rendered once near the app root
//     (in app/_layout.tsx).
//   - `stitchOnHost(uris)`: the async function that requests a capture
//     against that host. Called by lib/image/canvasCrop.ts's
//     stitchVerticallyUris when N > 1.
//
// Mirrors the call shape of canvasCrop.web.ts's stitchVerticallyUris so
// cross-platform code in app/document/[id].tsx is identical.

import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

type Item = { uri: string; w: number; h: number };

type Request = {
  items: Item[];
  resolve: (uri: string) => void;
  reject: (err: unknown) => void;
};

let pushRequest: ((req: Request) => void) | null = null;

export async function stitchOnHost(uris: string[]): Promise<string> {
  if (!pushRequest) {
    throw new Error(
      'stitchVerticallyUris: <StitchHost /> is not mounted. Render it once in app/_layout.tsx.',
    );
  }
  const sizes = await Promise.all(
    uris.map(
      (uri) =>
        new Promise<{ w: number; h: number }>((resolve, reject) =>
          Image.getSize(
            uri,
            (w, h) => resolve({ w, h }),
            (err) => reject(err),
          ),
        ),
    ),
  );
  const items: Item[] = uris.map((uri, i) => ({ uri, w: sizes[i].w, h: sizes[i].h }));
  return new Promise<string>((resolve, reject) => {
    pushRequest!({ items, resolve, reject });
  });
}

export function StitchHost() {
  const [req, setReq] = useState<Request | null>(null);
  const [loaded, setLoaded] = useState(0);
  const ref = useRef<View>(null);

  useEffect(() => {
    pushRequest = (r) => {
      setLoaded(0);
      setReq(r);
    };
    return () => {
      pushRequest = null;
    };
  }, []);

  useEffect(() => {
    if (!req || loaded < req.items.length) return;
    let cancelled = false;
    // useRenderInContext renders the view's LAYER directly (CALayer
    // renderInContext) instead of the default drawViewHierarchyInRect, which
    // only captures what's actually on screen. The stitch surface is parked
    // off-screen (so the user never sees it), so the default path would
    // capture a blank frame — renderInContext gets the real stacked images.
    captureRef(ref, {
      format: 'jpg',
      quality: 0.9,
      result: 'tmpfile',
      useRenderInContext: true,
    }).then(
      (uri) => {
        if (cancelled) return;
        const r = req;
        setReq(null);
        setLoaded(0);
        r.resolve(uri);
      },
      (err) => {
        if (cancelled) return;
        const r = req;
        setReq(null);
        setLoaded(0);
        r.reject(err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [req, loaded]);

  if (!req) return null;
  const width = Math.max(...req.items.map((i) => i.w));
  return (
    <View ref={ref} collapsable={false} style={[styles.surface, { width }]}>
      {req.items.map((it, i) => (
        <Image
          key={`${it.uri}-${i}`}
          source={{ uri: it.uri }}
          style={{ width: it.w, height: it.h }}
          onLoadEnd={() => setLoaded((l) => l + 1)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: 'absolute',
    // Off-screen so the user never sees it, but NOT opacity:0 —
    // react-native-view-shot renders the view's layer, and a layer at
    // opacity 0 captures as a blank (white, once flattened to JPEG) image.
    // The large left offset hides it; capturing by ref is independent of the
    // view's on-screen position, so the capture still gets the real pixels.
    left: -100000,
    top: 0,
    backgroundColor: '#fff',
  },
});
