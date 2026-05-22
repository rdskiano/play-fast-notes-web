// Foot-pedal capture. Renders the native KeyCaptureView from the local
// `hardware-keys` Expo module — an invisible view that reports hardware key
// presses. A Bluetooth foot pedal pairs as a keyboard; any key it sends
// counts as a pedal press and calls `onAdvance`. Renders nothing while the
// pedal is working — only surfaces a warning when no keyboard is detected.

import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { KeyCaptureView } from '@/modules/hardware-keys';

export function PedalCatcher({
  active,
  onAdvance,
}: {
  active: boolean;
  onAdvance: () => void;
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

  function advance() {
    const now = Date.now();
    // De-dupe key auto-repeat and the multiple native capture paths.
    if (now - lastAdvanceRef.current > 300) {
      lastAdvanceRef.current = now;
      onAdvance();
    }
  }

  return (
    <View>
      <Capture
        style={styles.capture}
        onArrowKey={() => advance()}
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
