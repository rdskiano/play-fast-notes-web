// Auto-fading banner for the Prompt timer (coach log D58). Shows one of the
// player's own coaching cues ("relax your throat", "support from the
// diaphragm") across the top of whatever screen they are on, then fades out
// on its own — hands stay on the instrument, nothing needs a tap. A tap
// dismisses early, but is never required.
//
// Mounted once, globally, next to PracticeTimerAlertModal in app/_layout.tsx
// so prompts reach every screen — including the document viewer, where real
// practice often runs with only the metronome and no session (D57).

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePromptTimer } from '@/components/PracticeTimersContext';
import { ThemedText } from '@/components/themed-text';

const FADE_IN_MS = 250;
const FADE_OUT_MS = 600;

export function PromptBanner() {
  const { activePrompt, dismissPrompt, setConfig } = usePromptTimer();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  // Keep the last text mounted through the fade-out so the banner does not
  // blink empty the instant the context clears the prompt.
  const [shownText, setShownText] = useState<string | null>(null);

  useEffect(() => {
    if (activePrompt) {
      setShownText(activePrompt);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShownText(null);
      });
    }
  }, [activePrompt, opacity]);

  if (!shownText) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 10, opacity }]}>
      <Pressable onPress={dismissPrompt} style={styles.card}>
        <ThemedText style={styles.text}>{shownText}</ThemedText>
        {/* Mute-where-it-appears: prompts fire on every screen (library
            included) but the timer controls only live on practice screens,
            so the banner itself carries the off switch. One tap turns the
            Prompts timer off; turning it back on happens wherever the
            timer tools are. */}
        <Pressable
          onPress={() => {
            setConfig({ enabled: false });
            dismissPrompt();
          }}
          hitSlop={10}
          accessibilityLabel="Turn prompt timer off"
          style={styles.muteBtn}>
          <ThemedText style={styles.muteBtnText}>🔕</ThemedText>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4000,
    // Above screen content, below the blocking timer overlays (which use a
    // Modal and always win anyway).
    elevation: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 520,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    // The metronome's fixed dark-graphite "device" look, theme-independent,
    // so the banner reads as equipment speaking, not UI chrome.
    backgroundColor: '#26282bee',
    borderWidth: 1,
    borderColor: '#ffffff2a',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    flexShrink: 1,
    color: '#f3efe9',
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  muteBtn: {
    opacity: 0.55,
    paddingLeft: 2,
  },
  muteBtnText: {
    fontSize: 16,
    lineHeight: 20,
  },
});
