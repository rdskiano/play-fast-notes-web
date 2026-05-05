// Inline player for a Self-Led Recording entry in the practice log.
// Uses a raw HTML <audio> element with native controls — simplest path on
// web, and the browser handles play/pause/seek/buffering. iPad parity will
// swap this for an expo-audio component when Self-Led Recording lands on
// the iPad in a future playbuild.

import { Platform, View } from 'react-native';

import { Spacing } from '@/constants/tokens';

type Props = {
  uri: string;
  // Optional inline cap so the control fits inside narrow log-card widths.
  maxWidth?: number;
};

export function RecordingPlayer({ uri, maxWidth }: Props) {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={{ paddingTop: Spacing.xs, maxWidth }}>
      {/* eslint-disable-next-line react-native/no-raw-text */}
      <audio src={uri} controls preload="metadata" style={{ width: '100%', height: 30 }} />
    </View>
  );
}
