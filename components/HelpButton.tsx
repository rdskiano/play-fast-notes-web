// HelpButton (native) — fixed bottom-right `?` button that opens the help
// modal for the current screen. Brought to parity with the web sibling so the
// installed app has the same per-screen help discovery the website does.
//
// Always visible. On screens where no <TutorialStep> has registered content,
// tapping opens a placeholder modal ("No help here yet"). The button lives in a
// fixed corner globally (mounted once by _layout.tsx); it doesn't need to know
// which screen it's on — the HelpContext does that bookkeeping.

import { Pressable, StyleSheet } from 'react-native';

import { useHelpContext } from '@/components/HelpContext';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/palette';
import { Radii, Type } from '@/constants/tokens';

// Matches the web help button + tour ⓘ dots (same blue "i").
const HELP_BLUE = Palette.accent;

export function HelpButton() {
  const { openManually, active } = useHelpContext();

  // No screen has registered help content (e.g. the onboarding quiz, which IS
  // the guide). Hide the button rather than show one that only says "No help
  // here yet". Mirrors the web sibling.
  if (!active) return null;

  return (
    <Pressable
      onPress={openManually}
      accessibilityRole="button"
      accessibilityLabel="Help for this screen"
      style={({ pressed }) => [
        styles.btn,
        { opacity: pressed ? 0.85 : 1 },
      ]}>
      <ThemedText style={styles.glyph}>i</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: Radii.circle,
    borderWidth: 2,
    backgroundColor: HELP_BLUE,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 100,
  },
  glyph: {
    color: '#fff',
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    fontStyle: 'italic',
    lineHeight: Type.size.lg + 2,
  },
});
