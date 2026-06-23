// Full-screen "rotate to landscape" gate for practice run screens on a phone.
// iOS Safari can't programmatically lock orientation, so instead of forcing
// the rotation we cover the practice UI in portrait with a prompt — practice
// is only usable in landscape, where the score gets the room it needs.
//
// Mount as the LAST child of a practice screen's root (so it paints over
// everything). Renders nothing on tablets / laptops or already in landscape.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Type } from '@/constants/tokens';

export function RotateForPractice({ disabled = false }: { disabled?: boolean } = {}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isPhone = Math.min(width, height) < 600;
  const isPortrait = height >= width;

  // Tools-only mode has no score to give room to (metronome / ladder run with
  // no piece), so portrait is fine — skip the rotate gate entirely.
  if (disabled || !isPhone || !isPortrait) return null;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <MaterialCommunityIcons
        name="phone-rotate-landscape"
        size={56}
        color={Palette.accent}
      />
      <ThemedText style={styles.title}>Rotate to landscape</ThemedText>
      <ThemedText style={styles.body}>
        Practice sessions use your phone sideways so the music has room. Turn
        your phone to keep going.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.paper,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 36,
    zIndex: 200,
  },
  title: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  body: {
    fontSize: Type.size.md,
    lineHeight: 22,
    color: Palette.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
});
