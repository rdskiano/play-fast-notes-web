// HelpButton — fixed bottom-right `?` button that opens the help
// modal for the current screen. Replaces the old FeedbackButton.
//
// Always visible on web (including phone — phone users especially
// need help discovery). On screens where no <TutorialStep> has
// registered content, clicking opens a placeholder modal that says
// "No help here yet" — intentionally honest, so blank-help screens
// become visible as a to-do list.
//
// The button lives in a fixed corner globally (mounted once by
// _layout.tsx). It doesn't need to know which screen it's on — the
// HelpContext does that bookkeeping.

import { Pressable, StyleSheet } from 'react-native';

import { useHelpContext } from '@/components/HelpContext';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function HelpButton() {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { openManually } = useHelpContext();

  return (
    <Pressable
      onPress={openManually}
      accessibilityRole="button"
      accessibilityLabel="Help for this screen"
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: C.tint,
          borderColor: C.tint,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <ThemedText style={styles.glyph}>?</ThemedText>
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
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
    // RN-Web maps this to CSS box-shadow.
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    // Make sure the button floats above tool docks, modals' backdrops
    // are higher so they still cover the button when open.
    zIndex: 100,
  },
  glyph: {
    color: '#fff',
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    lineHeight: Type.size.lg + 2,
  },
});
