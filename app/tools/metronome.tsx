import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Spacing, Type } from '@/constants/tokens';
import { TOOLS_METRONOME_HELP } from '@/constants/toolsHelp';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMetronome } from '@/lib/audio/useMetronome';

// Tools-mode standalone Metronome. PracticeToolsLayer already hosts the full
// metronome (meter, subdivisions, drum grooves) as an edge-docked tool on
// every practice screen; here we mount it on an otherwise-empty screen and
// hand it its own metronome instance so it drives the audio. The
// `metronomeNote` makes the panel pop open by default on laptop/tablet (the
// note copy itself is hidden on phone, where tools stay collapsed and the
// user taps the tab).

export default function ToolsMetronomeScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const metronome = useMetronome(120);

  function exit() {
    metronome.stop();
    router.back();
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={exit}
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Metronome
          </ThemedText>
        }
      />
      <View style={styles.body}>
        <ThemedText style={[styles.hint, { color: C.icon }]}>
          Open the 🥁 Metronome tab to set tempo, meter, subdivisions, and
          drum grooves.
        </ThemedText>
        <PracticeToolsLayer metronome={metronome} metronomeNote="Standalone metronome." />
      </View>

      <TutorialStep
        id="tools-metronome"
        visible
        title={TOOLS_METRONOME_HELP.title}
        body={TOOLS_METRONOME_HELP.body}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { textAlign: 'center', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  hint: { textAlign: 'center', fontSize: Type.size.md, lineHeight: 22, maxWidth: 360 },
});
