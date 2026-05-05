import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AbcStaffView } from '@/components/AbcStaffView';
import { Button } from '@/components/Button';
import type { Grouping } from '@/lib/strategies/rhythmPatterns';

import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { SelfLedSheet } from '@/components/SelfLedSheet';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import { getPassage, type Passage } from '@/lib/db/repos/passages';
import { getTempoLadder, type TempoLadderProgress } from '@/lib/db/repos/tempoLadder';

type StrategyKey = 'tempo_ladder' | 'click_up' | 'rhythmic';

type StrategyDef = {
  key: StrategyKey;
  label: string;
  enabled: boolean;
};

const STRATEGIES: StrategyDef[] = [
  { key: 'tempo_ladder', label: 'Tempo Ladder', enabled: true },
  { key: 'click_up', label: 'Interleaved Click-Up', enabled: true },
  { key: 'rhythmic', label: 'Rhythmic Variation', enabled: true },
];

const GROUPING_CHOICES: { n: Grouping; abc: string; w: number }[] = [
  { n: 3, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB', w: 70 },
  { n: 4, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBB', w: 90 },
  { n: 5, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBB', w: 100 },
  { n: 6, abc: 'X:1\nM:none\nL:1/8\nK:none clef=none stafflines=0\nBBB BBB', w: 120 },
  { n: 7, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBB', w: 130 },
  { n: 8, abc: 'X:1\nM:none\nL:1/16\nK:none clef=none stafflines=0\nBBBBBBBB', w: 140 },
];

export default function PassageDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors: strategyColors } = useStrategyColors();

  const [passage, setPassage] = useState<Passage | null>(null);
  const [tempoLadder, setTempoLadder] = useState<TempoLadderProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [rhythmicSheetOpen, setRhythmicSheetOpen] = useState(false);
  const [rhythmicStep, setRhythmicStep] = useState<'mode' | 'grouping'>('mode');
  const [selfLedOpen, setSelfLedOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      (async () => {
        try {
          const p = await getPassage(id);
          if (cancelled) return;
          setPassage(p);
          try {
            const ex = await getOrCreateExercise(id, 'tempo_ladder');
            const tl = await getTempoLadder(ex.id);
            if (!cancelled) setTempoLadder(tl);
          } catch {
            // exercise may not exist yet — that's fine
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (!passage) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Passage not found.</ThemedText>
        <Pressable onPress={() => router.replace('/library')} hitSlop={10}>
          <ThemedText style={{ color: C.tint, fontWeight: Type.weight.bold }}>
            ‹ Back to Library
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const tempoLadderProgress =
    tempoLadder && tempoLadder.goal_tempo > 0
      ? Math.max(0, Math.min(1, tempoLadder.current_tempo / tempoLadder.goal_tempo))
      : null;

  function openStrategy(key: StrategyKey) {
    if (!passage) return;
    if (key === 'tempo_ladder') {
      router.push(`/passage/${passage.id}/tempo-ladder`);
    } else if (key === 'click_up') {
      router.push(`/passage/${passage.id}/click-up`);
    } else if (key === 'rhythmic') {
      setRhythmicStep('mode');
      setRhythmicSheetOpen(true);
    }
  }

  function renderPill(s: StrategyDef) {
    const isTempoLadder = s.key === 'tempo_ladder';
    const pct =
      isTempoLadder && tempoLadderProgress !== null
        ? Math.round(tempoLadderProgress * 100)
        : null;
    const label = pct !== null ? `${s.label} ${pct}%` : s.label;
    const color = strategyColors[s.key] ?? C.icon;
    return (
      <Pressable
        key={s.key}
        disabled={!s.enabled}
        hitSlop={4}
        onPress={() => openStrategy(s.key)}
        style={[
          styles.stratPill,
          { backgroundColor: color, opacity: s.enabled ? 1 : 0.35 },
        ]}>
        <ThemedText style={styles.stratLabel}>{label}</ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { borderBottomColor: C.icon + '44' }]}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.backBtn}>
            <ThemedText style={[styles.backArrow, { color: C.tint }]}>‹</ThemedText>
          </Pressable>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {passage.title}
          </ThemedText>
          <PracticeTimersPill />
        </View>
        <View style={styles.pillRow}>
          {STRATEGIES.map(renderPill)}
          <Pressable
            onPress={() => setSelfLedOpen(true)}
            style={[styles.outlinePill, { borderColor: C.tint }]}>
            <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
              Self-Led ▾
            </ThemedText>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => router.push(`/passage/${passage.id}/history`)}
            style={[styles.outlinePill, { borderColor: C.icon }]}>
            <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
              Practice History
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/passage/${passage.id}/crop`)}
            style={[styles.outlinePill, { borderColor: C.icon }]}>
            <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
              Crop
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {passage.source_uri ? (
          <Image
            source={{ uri: passage.source_uri }}
            style={styles.scoreFill}
            contentFit="contain"
          />
        ) : (
          <View style={styles.noScore}>
            <ThemedText style={{ color: C.icon, textAlign: 'center' }}>
              No sheet music image yet.
            </ThemedText>
          </View>
        )}
      </View>

      <Modal
        visible={rhythmicSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRhythmicSheetOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheetCard, { backgroundColor: C.background, borderColor: C.icon }]}>
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => setRhythmicSheetOpen(false)}
                hitSlop={10}
                style={[styles.sheetCloseBtn, { borderColor: C.icon }]}>
                <ThemedText style={{ color: C.text, fontWeight: Type.weight.heavy }}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {rhythmicStep === 'mode' ? (
                <>
                  <ThemedText type="subtitle" style={styles.sheetTitle}>
                    Rhythmic Variation
                  </ThemedText>
                  <ThemedText style={styles.sheetDesc}>
                    Practicing a passage with different rhythmic patterns strengthens
                    your internal pulse, improves evenness, and exposes weak spots
                    that playing as written can hide.
                  </ThemedText>
                  <Button
                    label="Rhythm patterns only"
                    onPress={() => setRhythmicStep('grouping')}
                    style={{ backgroundColor: '#4a235a' }}
                    fullWidth
                  />
                  <ThemedText style={styles.sheetHint}>
                    Browse rhythm patterns with a metronome while you read from your
                    own score. Best when you already know the notes and just want to
                    drill the rhythm.
                  </ThemedText>
                  <Button
                    label="Exercise Builder"
                    onPress={() => {
                      setRhythmicSheetOpen(false);
                      router.push({
                        pathname: '/passage/[id]/rhythm-list',
                        params: { id: passage.id },
                      });
                    }}
                    style={{ backgroundColor: '#9b59b6' }}
                    fullWidth
                  />
                  <ThemedText style={styles.sheetHint}>
                    Enter the pitches of your passage using the piano keyboard, and the
                    app generates fully notated exercises for every rhythm pattern. Save
                    as many exercises per passage as you like.
                  </ThemedText>
                </>
              ) : (
                <>
                  <ThemedText type="subtitle" style={styles.sheetTitle}>
                    Note grouping of passage
                  </ThemedText>
                  <ThemedText style={styles.sheetDesc}>
                    How many notes are in each rhythmic unit of the passage you want
                    to practice? Count the notes in one beat or one measure —
                    whichever feels like a natural repeating chunk.
                  </ThemedText>
                  <View style={styles.groupingGrid}>
                    {GROUPING_CHOICES.map(({ n, abc, w }) => (
                      <Pressable
                        key={n}
                        onPress={() => {
                          setRhythmicSheetOpen(false);
                          router.push({
                            pathname: '/passage/[id]/rhythmic',
                            params: { id: passage.id, grouping: String(n) },
                          });
                        }}
                        style={[styles.groupingChip, { borderColor: C.icon }]}>
                        <AbcStaffView abc={abc} width={w} height={60} hideStaffLines centered />
                        <ThemedText style={styles.groupingNum}>{n}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    label="← Back"
                    variant="ghost"
                    onPress={() => setRhythmicStep('mode')}
                    fullWidth
                  />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SelfLedSheet
        visible={selfLedOpen}
        onCancel={() => setSelfLedOpen(false)}
        onPick={(key) => {
          setSelfLedOpen(false);
          if (!passage) return;
          if (key === 'recording') {
            router.push(`/passage/${passage.id}/self-led/recording` as never);
          } else {
            router.push(`/passage/${passage.id}/self-led/${key}` as never);
          }
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    padding: 18,
    gap: Spacing.sm,
    maxHeight: '90%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center' },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { textAlign: 'center', marginTop: 4 },
  sheetDesc: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    opacity: Opacity.muted,
    marginBottom: Spacing.sm,
  },
  sheetHint: {
    fontSize: 12,
    opacity: 0.55,
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
    marginTop: -4,
  },
  groupingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginVertical: Spacing.md,
  },
  groupingChip: {
    width: '47%',
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingVertical: 8,
    alignItems: 'center',
  },
  groupingNum: { fontSize: Type.size.xl, fontWeight: Type.weight.heavy, marginTop: -2 },
  topBar: {
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  backArrow: { fontSize: 30, fontWeight: '400', lineHeight: 32 },
  topTitle: { fontSize: 15, fontWeight: Type.weight.bold, flex: 1 },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  stratPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.xl },
  stratLabel: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  outlinePill: {
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  outlinePillText: { fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  body: { flex: 1, padding: Spacing.md },
  scoreFill: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0001',
    borderRadius: Radii.sm,
  },
  noScore: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Borders.thin,
    borderColor: '#0002',
    borderRadius: Radii.sm,
    borderStyle: 'dashed',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
});
