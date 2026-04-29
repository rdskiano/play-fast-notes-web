import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function ScoreImage({ uri }: { uri: string | null | undefined }) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    if (!uri) {
      setAspect(null);
      return;
    }
    if (typeof window === 'undefined') return;
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      setAspect(w / h);
    };
    img.onerror = () => setAspect(1);
    img.src = uri;
  }, [uri]);

  if (!uri || aspect == null) return null;

  return (
    <View style={[styles.wrap, { borderColor: C.icon }]}>
      <Image
        source={{ uri }}
        style={[styles.image, { aspectRatio: aspect }]}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.xs,
    backgroundColor: '#ffffff',
  },
  image: {
    width: '100%',
    borderRadius: Radii.sm,
  },
});
