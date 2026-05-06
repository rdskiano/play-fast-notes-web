// Inline player for a Self-Led Recording entry in the practice log.
// Uses a raw HTML <audio> element with native controls — simplest path on
// web, and the browser handles play/pause/seek/buffering. iPad parity will
// swap this for an expo-audio component when Self-Led Recording lands on
// the iPad in a future playbuild.

import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, Type } from '@/constants/tokens';

type Props = {
  uri: string;
  // Optional inline cap so the control fits inside narrow log-card widths.
  maxWidth?: number;
};

// Stops every relevant pointer / touch / click event from bubbling up to
// the surrounding Pressable, which would otherwise open the entry's edit
// modal whenever the user just wanted to scrub or play the audio.
function stopAll(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

export function RecordingPlayer({ uri, maxWidth }: Props) {
  const [errored, setErrored] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  if (Platform.OS !== 'web') return null;
  if (errored) {
    return (
      <View style={{ paddingTop: Spacing.xs, maxWidth, gap: 2 }}>
        <ThemedText style={{ fontSize: Type.size.xs, fontStyle: 'italic', opacity: 0.6 }}>
          Recording unavailable{errorCode != null ? ` (code ${errorCode})` : ''}.
        </ThemedText>
        <Pressable
          onPress={() => {
            if (typeof window !== 'undefined') window.open(uri, '_blank');
          }}>
          <ThemedText style={{ fontSize: Type.size.xs, color: '#1976d2', textDecorationLine: 'underline' }}>
            Open audio URL in new tab
          </ThemedText>
        </Pressable>
      </View>
    );
  }
  return (
    <div
      onPointerDown={stopAll}
      onMouseDown={stopAll}
      onTouchStart={stopAll}
      onClick={stopAll}
      style={{ paddingTop: Spacing.xs, maxWidth, width: '100%' }}>
      {/* eslint-disable-next-line react-native/no-raw-text */}
      <audio
        src={uri}
        controls
        preload="metadata"
        onError={(e) => {
          const target = e.currentTarget as HTMLAudioElement;
          const code = target?.error?.code ?? null;
          // eslint-disable-next-line no-console
          console.warn('[RecordingPlayer] audio error', { uri, code, error: target?.error });
          setErrorCode(code);
          setErrored(true);
        }}
        style={{ width: '100%', height: 30 }}
      />
    </div>
  );
}
