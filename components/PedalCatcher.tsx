// Foot-pedal capture. Renders the native KeyCaptureView from the local
// `hardware-keys` Expo module — an invisible view that reports hardware key
// presses. A Bluetooth foot pedal pairs as a keyboard; any key it sends counts
// as a pedal press and calls `onAdvance`.
//
// Renders nothing visible. The foot pedal is an OPTIONAL accessory, so its
// absence is not an error: a persistent "Foot pedal not detected" banner used
// to show on every practice screen to everyone without a pedal (i.e. always, on
// a phone), stealing vertical space from the score and implying something was
// broken. The on-screen NEXT / Clean / Miss buttons and keyboard shortcuts
// already cover every action, so a missing pedal is simply silent now.

import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { KeyCaptureView } from '@/modules/hardware-keys';

// Keys the native module reports for the left pedal on a two-pedal foot
// switch. The right pedal advances; these go back.
const BACK_KEYS = new Set(['up', 'left', 'pageup']);

export function PedalCatcher({
  active,
  onAdvance,
  onBack,
  secondaryKey,
  onSecondary,
}: {
  active: boolean;
  onAdvance: () => void;
  // Optional "go back a step" binding (Click-Up). When provided, the left
  // pedal (up / left / pageup) fires `onBack`; without it, every pedal key
  // advances (the historical behavior).
  onBack?: () => void;
  // Optional second outcome for screens with two rep results (Tempo Ladder:
  // Clean vs Miss). A two-button foot pedal already works via `onBack` — its
  // LEFT pedal emits a back key (up/left/pageup) and fires the second action,
  // its RIGHT pedal advances. This also wires `secondaryKey` so a hardware
  // keyboard key (e.g. "x" = Miss) fires it too, matching the web sibling.
  secondaryKey?: string;
  onSecondary?: () => void;
}) {
  const lastAdvanceRef = useRef(0);

  if (!active) return null;

  const Capture = KeyCaptureView;
  // Module missing (shouldn't happen in a proper build): the pedal just
  // doesn't work; on-screen buttons + keyboard still do. No banner.
  if (!Capture) return null;

  function fire(key: string) {
    const now = Date.now();
    // De-dupe key auto-repeat and the multiple native capture paths.
    if (now - lastAdvanceRef.current <= 300) return;
    lastAdvanceRef.current = now;
    if (
      onSecondary &&
      secondaryKey &&
      key.toLowerCase() === secondaryKey.toLowerCase()
    ) {
      // A keyboard pressed the secondary key (e.g. "x" = Miss).
      onSecondary();
    } else if (onBack && BACK_KEYS.has(key)) {
      // Left pedal → back / second-outcome (Click-Up: BACK; Tempo Ladder: Miss).
      onBack();
    } else {
      onAdvance();
    }
  }

  return (
    <View>
      <Capture style={styles.capture} onArrowKey={(e) => fire(e.nativeEvent.key)} />
    </View>
  );
}

const styles = StyleSheet.create({
  capture: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
