// Read-only overlay of a passage's saved Apple Pencil annotation, for the
// practice screens (the annotation is edited on the passage detail screen).
// The saved PNG has the same aspect ratio as the score, so rendering it
// `contain`-fit over the score auto-aligns — no coordinate math needed.
// Drop this as a sibling of a `contain`-fit score image inside a relative
// container; it absolutely fills that container.

import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getAnnotation } from '@/lib/db/repos/annotations';

export function AnnotationOverlay({ passageId }: { passageId: string }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAnnotation(passageId)
      .then((a) => {
        if (!cancelled) setUri(a?.imageUri ?? null);
      })
      .catch(() => {
        if (!cancelled) setUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [passageId]);

  if (!uri) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
      />
    </View>
  );
}
