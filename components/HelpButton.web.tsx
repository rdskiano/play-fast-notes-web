// HelpButton — fixed bottom-right "i" (info) button that opens the help
// modal for the current screen. Replaces the old FeedbackButton.
//
// Styled to match the guided-tour ⓘ dots (same teal, same "i", same white
// ring) so the whole help system reads as one family. Always visible on
// web (including phone). On screens that register a guided tour, tapping
// it starts the full walkthrough instead of the text modal (the tour IS
// that screen's help; the per-control ⓘ dots show single steps).
//
// First-visit nudge (2026-09-09): instructional popups and tours no
// longer auto-fire. Instead, the first time ever a user lands on a screen
// whose help would have auto-opened, this button pulses a few times with
// a small "New here?" tag, then settles. Tapping either opens the help.
//
// The button lives in a fixed corner globally (mounted once by
// _layout.tsx). It doesn't need to know which screen it's on — the
// HelpContext does that bookkeeping.

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useHelpContext } from '@/components/HelpContext';
import { ThemedText } from '@/components/themed-text';
import { useTour } from '@/components/tour/TourContext';
import { Palette } from '@/constants/palette';
import { Radii, Type } from '@/constants/tokens';

// The "i" affordances (this button + the per-control tour dots) use the
// site's blue so they read as native chrome. The tour/modal *accents*
// (ring, buttons, labels) use orange — see TourContext.web ACCENT.
const HELP_BLUE = Palette.accent;
// Nudge tag matches the dark coaching layer (HelpModal / TourContext).
const TAG_BG = '#1e293b';
const TAG_TEXT = '#f8fafc';

// How long the "New here?" tag lingers before fading away on its own.
const TAG_MS = 7000;

export function HelpButton() {
  const { openManually, active, nudge } = useHelpContext();
  const { screen, nudge: tourNudge, start } = useTour();

  const showNudge = nudge || tourNudge;
  const pulse = useRef(new Animated.Value(1)).current;
  const [tagVisible, setTagVisible] = useState(false);

  useEffect(() => {
    if (!showNudge) {
      setTagVisible(false);
      return;
    }
    setTagVisible(true);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
      { iterations: 4 },
    );
    anim.start();
    const t = setTimeout(() => setTagVisible(false), TAG_MS);
    return () => {
      anim.stop();
      pulse.setValue(1);
      clearTimeout(t);
    };
  }, [showNudge, pulse]);

  // No screen has registered help content or a tour (e.g. the onboarding
  // quiz, which IS the guide). Don't show a button that would only say
  // "No help here yet" — hide it entirely.
  if (!active && !screen) return null;

  // A registered tour is that screen's help — the button runs it.
  const open = screen ? () => start(0) : openManually;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {tagVisible && (
        <Pressable onPress={open} style={styles.tag} accessibilityRole="button">
          <ThemedText style={styles.tagText}>
            New here? Tap for a quick guide
          </ThemedText>
        </Pressable>
      )}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="Help for this screen"
          style={({ pressed }) => [
            styles.btn,
            { opacity: pressed ? 0.85 : 1 },
          ]}>
          <ThemedText style={styles.glyph}>i</ThemedText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // Make sure the button floats above tool docks; modals' backdrops
    // are higher so they still cover the button when open.
    zIndex: 100,
  },
  tag: {
    backgroundColor: TAG_BG,
    borderRadius: Radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    maxWidth: 240,
  },
  tagText: {
    color: TAG_TEXT,
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    lineHeight: 16,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: Radii.circle,
    borderWidth: 2,
    backgroundColor: HELP_BLUE,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    // RN-Web maps this to CSS box-shadow.
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  glyph: {
    color: '#fff',
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    fontStyle: 'italic',
    lineHeight: Type.size.md + 2,
  },
});
