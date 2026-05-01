import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PracticeTimersPill } from '@/components/GlobalTimerTray';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getOrCreateExercise } from '@/lib/db/repos/exercises';
import { getPiece, type Piece } from '@/lib/db/repos/pieces';
import { getTempoLadder, type TempoLadderProgress } from '@/lib/db/repos/tempoLadder';

type StrategyKey = 'tempo_ladder' | 'click_up' | 'rhythmic';

type StrategyDef = {
  key: StrategyKey;
  label: string;
  color: string;
  enabled: boolean;
};

const STRATEGIES: StrategyDef[] = [
  { key: 'tempo_ladder', label: 'Tempo Ladder', color: '#2ecc71', enabled: true },
  { key: 'click_up', label: 'Interleaved Click-Up', color: '#154360', enabled: false },
  { key: 'rhythmic', label: 'Rhythmic Variation', color: '#4a235a', enabled: false },
];

export default function PieceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [piece, setPiece] = useState<Piece | null>(null);
  const [tempoLadder, setTempoLadder] = useState<TempoLadderProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      (async () => {
        try {
          const p = await getPiece(id);
          if (cancelled) return;
          setPiece(p);
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

  if (!piece) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Piece not found.</ThemedText>
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
    if (!piece) return;
    if (key === 'tempo_ladder') {
      router.push(`/piece/${piece.id}/tempo-ladder`);
    }
  }

  function renderPill(s: StrategyDef) {
    const isTempoLadder = s.key === 'tempo_ladder';
    const pct =
      isTempoLadder && tempoLadderProgress !== null
        ? Math.round(tempoLadderProgress * 100)
        : null;
    const label = pct !== null ? `${s.label} ${pct}%` : s.label;
    return (
      <Pressable
        key={s.key}
        disabled={!s.enabled}
        hitSlop={4}
        onPress={() => openStrategy(s.key)}
        style={[
          styles.stratPill,
          { backgroundColor: s.color, opacity: s.enabled ? 1 : 0.35 },
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
            {piece.title}
          </ThemedText>
          <PracticeTimersPill />
        </View>
        <View style={styles.pillRow}>
          {STRATEGIES.map(renderPill)}
          <Pressable
            disabled
            style={[styles.outlinePill, { borderColor: C.tint, opacity: 0.4 }]}>
            <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
              Unguided ▾
            </ThemedText>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            disabled
            style={[styles.outlinePill, { borderColor: C.icon, opacity: 0.4 }]}>
            <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
              Practice History
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/piece/${piece.id}/crop`)}
            style={[styles.outlinePill, { borderColor: C.icon }]}>
            <ThemedText style={[styles.outlinePillText, { color: C.tint }]}>
              Crop
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {piece.source_uri ? (
          <Image
            source={{ uri: piece.source_uri }}
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
