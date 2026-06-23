import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Lift, Palette } from '@/constants/palette';
import { Fonts } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { TOOLS_HUB_HELP } from '@/constants/toolsHelp';
import { TOOLS_ONLY_ID } from '@/lib/strategies/toolsMode';

// The library's "Tools" hub — practice tools you can use without attaching a
// piece of music. Tempo Ladder and Rhythm Variations reuse their real screens
// via the TOOLS_ONLY_ID sentinel route (blank backdrop, no saved progress);
// Metronome and Tempo Stepper are dedicated tools-mode screens.

type ToolCard = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  color: string;
  route: string;
};

export default function ToolsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useStrategyColors();
  const { width: vpW, height: vpH } = useWindowDimensions();
  const isPhone = Math.min(vpW, vpH) < 600;

  const cards: ToolCard[] = [
    {
      icon: 'metronome',
      title: 'Metronome',
      subtitle: 'Tempo, meter, subdivisions, drum grooves, drone, and random gaps.',
      color: Palette.textSecondary,
      route: '/tools/metronome',
    },
    {
      icon: 'stairs',
      title: 'Tempo Ladder',
      subtitle: 'Climb the tempo — Step, Cluster, or your Custom patterns.',
      color: colors.tempo_ladder ?? Palette.tempoLadder,
      route: `/passage/${TOOLS_ONLY_ID}/tempo-ladder`,
    },
    {
      icon: 'music-note',
      title: 'Rhythm Variations',
      subtitle: 'Cycle rhythm patterns against the click.',
      color: colors.rhythmic ?? Palette.rhythmic,
      route: `/passage/${TOOLS_ONLY_ID}/rhythmic`,
    },
    {
      icon: 'account-group',
      title: 'Community Library',
      subtitle: 'Browse and download rhythm exercises shared by other players.',
      color: Palette.accent,
      route: '/community',
    },
  ];

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md }]}>
        {/* Big-title header (DESIGN_RULES §3 — left-aligned page title) */}
        <View style={styles.header}>
          <Pressable
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace('/(tabs)/library' as never)
            }
            hitSlop={8}>
            <ThemedText style={styles.backLink}>‹ Library</ThemedText>
          </Pressable>
          <ThemedText type="title">Tools</ThemedText>
        </View>

        {/* Headline on-ramp: the free tools below are the hook; bringing your
            own music in (coached, with saved progress) is the upgrade in
            engagement — and eventually the paid tier. Keep this first so the
            tools room is a door INTO the app, not a dead end. */}
        <Pressable
          onPress={() => router.push('/upload?coach=1' as never)}
          style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="music-note-plus" size={26} color="#fff" />
          </View>
          <View style={styles.heroBody}>
            <ThemedText style={styles.heroTitle}>Add my music &amp; get some guidance</ThemedText>
            <ThemedText style={styles.heroSubtitle}>
              Snap a photo, mark the spot, and I’ll guide you through it and
              remember your progress.
            </ThemedText>
          </View>
          <ThemedText style={styles.heroArrow}>›</ThemedText>
        </Pressable>
        <ThemedText style={styles.intro}>
          Or just grab a tool — nothing to set up, nothing saved.
        </ThemedText>
        <View style={[styles.grid, isPhone && styles.gridPhone]}>
          {cards.map((card) => (
            <Pressable
              key={card.title}
              onPress={() => router.push(card.route as never)}
              style={({ pressed }) => [
                styles.card,
                isPhone && styles.cardPhone,
                pressed && { transform: [{ scale: 0.985 }] },
              ]}>
              <View style={[styles.accent, { backgroundColor: card.color }]} />
              <View style={styles.cardBody}>
                <View style={[styles.cardIcon, { backgroundColor: card.color + '1A' }]}>
                  <MaterialCommunityIcons name={card.icon} size={22} color={card.color} />
                </View>
                <ThemedText style={styles.cardTitle}>{card.title}</ThemedText>
                <ThemedText style={styles.cardSubtitle}>{card.subtitle}</ThemedText>
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
  content: { padding: Spacing.lg, gap: Spacing.lg },
  header: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.xs },
  backLink: { fontSize: Type.size.md, fontWeight: Type.weight.semibold, color: Palette.accent },
  hero: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii['2xl'],
    backgroundColor: Palette.accent,
    ...Lift,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff2e',
  },
  heroBody: { flex: 1, gap: 4 },
  heroTitle: { fontFamily: Fonts.rounded, fontSize: Type.size.lg, fontWeight: Type.weight.heavy, color: '#fff' },
  heroSubtitle: { fontSize: Type.size.sm, lineHeight: 18, color: '#ffffffe6' },
  heroArrow: { fontSize: 28, color: '#fff', fontWeight: Type.weight.bold },
  intro: {
    fontSize: Type.size.sm,
    lineHeight: 20,
    textAlign: 'center',
    color: Palette.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'center',
  },
  gridPhone: { flexDirection: 'column' },
  card: {
    width: 260,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii['2xl'],
    overflow: 'hidden',
    flexDirection: 'row',
    minHeight: 110,
    ...Lift,
  },
  cardPhone: { width: '100%' },
  accent: { width: 8 },
  cardBody: { flex: 1, padding: Spacing.lg, gap: 6, justifyContent: 'center' },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  cardTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
  },
  cardSubtitle: { fontSize: Type.size.sm, lineHeight: 18, color: Palette.textSecondary },
});
