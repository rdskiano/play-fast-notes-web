// Local Expo module — captures hardware keyboard presses (a Bluetooth foot
// pedal pairs as a keyboard) and surfaces them to JS. Unlike a React Native
// TextInput, the native view here reports arrow keys.

import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export type HardwareKey = 'up' | 'down' | 'left' | 'right' | 'enter' | 'space';

export type KeyCaptureViewProps = ViewProps & {
  onArrowKey?: (event: { nativeEvent: { key: HardwareKey } }) => void;
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
