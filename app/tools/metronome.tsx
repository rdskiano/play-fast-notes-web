import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PracticeToolsLayer } from '@/components/PracticeToolsLayer';
import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ToolsMetronome } from '@/components/ToolsMetronome';
import { TutorialStep } from '@/components/TutorialStep';
import { Spacing, Type } from '@/constants/tokens';
import { TOOLS_METRONOME_HELP } from '@/constants/toolsHelp';
import { useMetronome } from '@/lib/audio/useMetronome';

// Tools-mode standalone Metronome. The full metronome (meter, subdivisions,
// drum grooves) lives in MetronomePanel; here we drop it straight into the
// middle of the screen — front and centre, since the metronome IS the screen —
// rather than behind an edge tab. PracticeToolsLayer still mounts the practice
// timers on the right edge (its metronome tab is removed to avoid a second one).

export default function ToolsMetronomeScreen() {
  const router = useRouter();
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
        <ToolsMetronome metronome={metronome} height={384} />
      </View>
      <PracticeToolsLayer metronome={metronome} tools={{ left: [], right: ['timer'] }} />

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
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
});
