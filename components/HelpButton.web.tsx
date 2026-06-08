// HelpButton — fixed bottom-right "i" (info) button that opens the help
// modal for the current screen. Replaces the old FeedbackButton.
//
// Styled to match the guided-tour ⓘ dots (same teal, same "i", same white
// ring) so the whole help system reads as one family. Always visible on
// web (including phone) EXCEPT on screens that have a guided tour, where
// the tour + its dots are the help and this would be redundant.
//
// The button lives in a fixed corner globally (mounted once by
// _layout.tsx). It doesn't need to know which screen it's on — the
// HelpContext does that bookkeeping.

import { Pressable, StyleSheet } from 'react-native';

import { useHelpContext } from '@/components/HelpContext';
import { ThemedText } from '@/components/themed-text';
import { useTour } from '@/components/tour/TourContext';
import { Radii, Type } from '@/constants/tokens';

// Shared with the tour accent (TourContext.web ACCENT) so the floating
// button and the per-control ⓘ dots are visually one family.
const HELP_TEAL = '#2dd4bf';

export function HelpButton() {
  const { openManually } = useHelpContext();
  const { screen } = useTour();

  // Screens with a guided tour carry their own help (the first-run tour +
  // the per-control ⓘ dots), so the floating button is redundant there
  // and we hide it. On every other screen it's still the help entry point
  // and opens the modal.
  if (screen) return null;

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
    backgroundColor: HELP_TEAL,
    borderColor: '#fff',
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
    fontStyle: 'italic',
    lineHeight: Type.size.lg + 2,
  },
});
