// Foot-pedal capture. Renders the native KeyCaptureView from the local
// `hardware-keys` Expo module — a near-invisible view that becomes first
// responder and reports hardware key presses (arrows / enter / space).
// A Bluetooth foot pedal pairs as a keyboard; any key it sends counts as
// a pedal press and calls `onAdvance`.

import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { KeyCaptureView, type HardwareKey } from '@/modules/hardware-keys';

export function PedalCatcher({
  active,
  onAdvance,
  onKey,
}: {
  active: boolean;
  onAdvance: () => void;
  /** Reports the last key seen — for the on-screen "is it working" readout. */
  onKey?: (key: string) => void;
}) {
  const [lastKey, setLastKey] = useState('—');
  const lastAdvanceRef = useRef(0);

  if (!active) return null;

  const Capture = KeyCaptureView;
  if (!Capture) {
    return (
      <View style={styles.wrap}>
        <ThemedText style={styles.line}>
          Foot pedal: native module not in this build — reinstall the latest build.
        </ThemedText>
      </View>
    );
  }

  function handleKey(key: HardwareKey) {
    setLastKey(key);
    onKey?.(key);
    const now = Date.now();
    // De-dupe rapid repeats / key auto-repeat.
    if (now - lastAdvanceRef.current > 300) {
      lastAdvanceRef.current = now;
      onAdvance();
    }
  }

  return (
    <View style={styles.wrap}>
      <Capture
        style={styles.capture}
        onArrowKey={(e) => handleKey(e.nativeEvent.key)}
      />
      <ThemedText style={styles.line}>
        Foot pedal armed — last key: {lastKey}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingVertical: 6 },
  line: { fontSize: 13, fontWeight: '700' },
  capture: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
