// Foot-pedal capture. Renders the native KeyCaptureView from the local
// `hardware-keys` Expo module — an invisible view that reports hardware key
// presses (arrows / enter / space / page up-down). A Bluetooth foot pedal
// pairs as a keyboard; any key it sends counts as a pedal press and calls
// `onAdvance`. The on-screen readout shows whether a keyboard is connected
// and which capture path is seeing the key.

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
  const [connected, setConnected] = useState(false);
  const [armed, setArmed] = useState(false);
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

  function handleKey(key: HardwareKey, via: string) {
    setLastKey(`${key} (${via})`);
    onKey?.(key);
    const now = Date.now();
    // De-dupe rapid repeats / key auto-repeat / multiple capture paths firing.
    if (now - lastAdvanceRef.current > 300) {
      lastAdvanceRef.current = now;
      onAdvance();
    }
  }

  return (
    <View style={styles.wrap}>
      <Capture
        style={styles.capture}
        onArrowKey={(e) => handleKey(e.nativeEvent.key, e.nativeEvent.via)}
        onStatus={(e) => {
          setConnected(e.nativeEvent.keyboard);
          setArmed(e.nativeEvent.firstResponder);
        }}
      />
      <ThemedText style={styles.line}>
        Foot pedal: {connected ? 'connected' : 'not detected'} — last press: {lastKey}
      </ThemedText>
      <ThemedText style={styles.sub}>capture armed: {armed ? 'yes' : 'no'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingVertical: 6 },
  line: { fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 11, opacity: 0.6 },
  capture: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
