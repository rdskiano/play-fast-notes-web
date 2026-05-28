// Foot-pedal capture. Renders the native KeyCaptureView from the local
// `hardware-keys` Expo module — an invisible view that reports hardware key
// presses. A Bluetooth foot pedal pairs as a keyboard; any key it sends
// counts as a pedal press and calls `onAdvance`. Renders nothing while the
// pedal is working — only surfaces a warning when no keyboard is detected.

import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { KeyCaptureView } from '@/modules/hardware-keys';

// Keys the native module reports for the left pedal on a two-pedal foot
// switch. The right pedal advances; these go back.
const BACK_KEYS = new Set(['up', 'left', 'pageup']);

export function PedalCatcher({
  active,
  onAdvance,
  onBack,
}: {
  active: boolean;
  onAdvance: () => void;
  // Optional "go back a step" binding (Click-Up). When provided, the left
  // pedal (up / left / pageup) fires `onBack`; without it, every pedal key
  // advances (the historical behavior).
  onBack?: () => void;
  // The web sibling supports a secondary key binding (e.g. X = Miss in
  // Tempo Ladder) so the laptop user can mirror what a two-button pedal
  // would do. iPad only has one foot pedal that emits arrow keys, so
  // these props are accepted for prop-type parity with the web sibling
  // and intentionally ignored here.
  secondaryKey?: string;
  onSecondary?: () => void;
}) {
  // null until the native side first reports; then true / false.
  const [connected, setConnected] = useState<boolean | null>(null);
  const lastAdvanceRef = useRef(0);

  if (!active) return null;

  const Capture = KeyCaptureView;
  if (!Capture) {
    return (
      <ThemedText style={styles.warn}>
        Foot pedal needs the latest app build — reinstall to use it.
      </ThemedText>
    );
  }

  function fire(key: string) {
    const now = Date.now();
    // De-dupe key auto-repeat and the multiple native capture paths.
    if (now - lastAdvanceRef.current <= 300) return;
    lastAdvanceRef.current = now;
    if (onBack && BACK_KEYS.has(key)) {
      onBack();
    } else {
      onAdvance();
    }
  }

  return (
    <View>
      <Capture
        style={styles.capture}
        onArrowKey={(e) => fire(e.nativeEvent.key)}
        onStatus={(e) => setConnected(e.nativeEvent.keyboard)}
      />
      {connected === false && (
        <ThemedText style={styles.warn}>
          Foot pedal not detected — switch it on and check it&apos;s paired in
          Settings → Bluetooth.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  warn: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  capture: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
