import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SessionTopBar } from '@/components/SessionTopBar';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { TOOLS_HUB_HELP } from '@/constants/toolsHelp';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TOOLS_ONLY_ID } from '@/lib/strategies/toolsMode';

// The library's "Tools" hub — practice tools you can use without attaching a
// piece of music. Tempo Ladder and Rhythm Variations reuse their real screens
// via the TOOLS_ONLY_ID sentinel route (blank backdrop, no saved progress);
// Metronome and Tempo Stepper are dedicated tools-mode screens.

type ToolCard = {
  emoji: string;
  title: string;
  subtitle: string;
  color: string;
  route: string;
};

export default function ToolsHubScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors } = useStrategyColors();
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;

  const cards: ToolCard[] = [
    {
      emoji: '🥁',
      title: 'Metronome',
      subtitle: 'Tempo, meter, subdivisions, drum grooves, drone, and random gaps.',
      color: '#3a3f44',
      route: '/tools/metronome',
    },
    {
      emoji: '🪜',
      title: 'Tempo Ladder',
      subtitle: 'Climb the tempo — Step, Cluster, or your Custom patterns.',
      color: colors.tempo_ladder ?? '#2ecc71',
      route: `/passage/${TOOLS_ONLY_ID}/tempo-ladder`,
    },
    {
      emoji: '🎵',
      title: 'Rhythm Variations',
      subtitle: 'Cycle rhythm patterns against the click.',
      color: colors.rhythmic ?? '#4a235a',
      route: `/passage/${TOOLS_ONLY_ID}/rhythmic`,
    },
    {
      emoji: '🌐',
      title: 'Community Library',
      subtitle: 'Browse and download rhythm exercises shared by other players.',
      color: '#0a7ea4',
      route: '/community',
    },
  ];

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() =>
          router.canGoBack()
            ? router.back()
            : router.replace('/(tabs)/library' as never)
        }
        exitLabel="‹ Library"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Tools
          </ThemedText>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Headline on-ramp: the free tools below are the hook; bringing your
            own music in (coached, with saved progress) is the upgrade in
            engagement — and eventually the paid tier. Keep this first so the
            tools room is a door INTO the app, not a dead end. */}
        <Pressable
          onPress={() => router.push('/upload?coach=1' as never)}
          style={[styles.hero, { backgroundColor: colors.tempo_ladder ?? '#2ecc71' }]}>
          <ThemedText style={styles.heroEmoji}>🎵</ThemedText>
          <View style={styles.heroBody}>
            <ThemedText style={styles.heroTitle}>Add my music &amp; get some guidance</ThemedText>
            <ThemedText style={styles.heroSubtitle}>
              Snap a photo, mark the spot, and I’ll guide you through it and
              remember your progress.
            </ThemedText>
          </View>
          <ThemedText style={styles.heroArrow}>›</ThemedText>
        </Pressable>
        <ThemedText style={[styles.intro, { color: C.icon }]}>
          Or just grab a tool — nothing to set up, nothing saved.
        </ThemedText>
        <View style={[styles.grid, isPhone && styles.gridPhone]}>
          {cards.map((card) => (
            <Pressable
              key={card.title}
              onPress={() => router.push(card.route as never)}
              style={[
                styles.card,
                isPhone && styles.cardPhone,
                { borderColor: C.icon + '55', backgroundColor: C.background },
              ]}>
              <View style={[styles.accent, { backgroundColor: card.color }]} />
              <View style={styles.cardBody}>
                <ThemedText style={styles.cardEmoji}>{card.emoji}</ThemedText>
                <ThemedText style={styles.cardTitle}>{card.title}</ThemedText>
                <ThemedText style={[styles.cardSubtitle, { color: C.icon }]}>
                  {card.subtitle}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* First-time intro for the hub — auto-fires once ever, then the "?"
          button reopens it on demand. */}
      <TutorialStep
        id="tools-hub"
        visible
        title={TOOLS_HUB_HELP.title}
        body={TOOLS_HUB_HELP.body}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { textAlign: 'center', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  content: { padding: Spacing.lg, gap: Spacing.lg },
  hero: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii.xl,
  },
  heroEmoji: { fontSize: 32 },
  heroBody: { flex: 1, gap: 4 },
  heroTitle: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy, color: '#fff' },
  heroSubtitle: { fontSize: Type.size.sm, lineHeight: 18, color: '#ffffffe6' },
  heroArrow: { fontSize: 28, color: '#fff', fontWeight: Type.weight.bold },
  intro: { fontSize: Type.size.sm, lineHeight: 20, textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'center',
  },
  gridPhone: { flexDirection: 'column' },
  card: {
    width: 260,
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 110,
  },
  cardPhone: { width: '100%' },
  accent: { width: 8 },
  cardBody: { flex: 1, padding: Spacing.lg, gap: 6, justifyContent: 'center' },
  cardEmoji: { fontSize: 30 },
  cardTitle: { fontSize: Type.size.lg, fontWeight: Type.weight.heavy },
  cardSubtitle: { fontSize: Type.size.sm, lineHeight: 18 },
});
