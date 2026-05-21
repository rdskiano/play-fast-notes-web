// Local Expo module — captures hardware keyboard presses (a Bluetooth foot
// pedal pairs as a keyboard) and surfaces them to JS. Unlike a React Native
// TextInput, the native view here reports arrow keys.

import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

// Whatever the native side reports — known names ('up', 'pagedown', …) or a
// raw fallback for an unrecognized key. Pedals map to arbitrary keys, so any
// value here counts as a pedal press.
export type HardwareKey = string;

export type KeyCaptureViewProps = ViewProps & {
  // `via` tells which native path caught it: 'gamepad' | 'command' | 'press'.
  onArrowKey?: (event: { nativeEvent: { key: HardwareKey; via: string } }) => void;
  // Liveness readout: is a keyboard connected, does this view hold focus.
  onStatus?: (event: {
    nativeEvent: { firstResponder: boolean; keyboard: boolean };
  }) => void;
};

// Native view that becomes first responder and reports key presses. Null
// when running a build that predates the module — callers degrade.
let KeyCaptureView: ComponentType<KeyCaptureViewProps> | null = null;
try {
  KeyCaptureView = requireNativeView<KeyCaptureViewProps>('HardwareKeys');
} catch {
  KeyCaptureView = null;
}

export { KeyCaptureView };
