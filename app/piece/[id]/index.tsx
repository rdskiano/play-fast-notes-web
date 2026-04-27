import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPiece, type Piece } from '@/lib/db/repos/pieces';
import {
  getStalenessForPiece,
  type StalenessRow,
} from '@/lib/db/repos/strategyLastUsed';

type StrategyRow = {
  key: 'tempo_ladder' | 'click_up' | 'rhythmic' | 'chunking';
  label: string;
  enabled: boolean;
  description: string;
};

const STRATEGIES: StrategyRow[] = [
  {
    key: 'tempo_ladder',
    label: 'Tempo Ladder',
    enabled: true,
    description: 'Climb a metronome from a slow start tempo to your goal, one rep at a time.',
  },
  {
    key: 'click_up',
    label: 'Interleaved Click-Up',
    enabled: false,
    description: 'Coming soon.',
  },
  {
    key: 'rhythmic',
    label: 'Rhythmic Variation',
    enabled: false,
    description: 'Coming soon.',
  },
  {
    key: 'chunking',
    label: 'Chunking',
    enabled: false,
    description: 'Coming soon.',
  },
];

function formatStaleness(ts: number | undefined): string {
  if (!ts) return 'never';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export default function PieceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [piece, setPiece] = useState<Piece | null>(null);
  const [staleness, setStaleness] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      Promise.all([getPiece(id), getStalenessForPiece(id)])
        .then(([p, rows]: [Piece | null, StalenessRow[]]) => {
          if (cancelled) return;
          setPiece(p);
          const map: Record<string, number> = {};
          for (const r of rows) map[r.strategy] = r.last_used_at;
          setStaleness(map);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={{ opacity: 0.6 }}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (!piece) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Piece not found.</ThemedText>
        <Button label="Back to Library" onPress={() => router.replace('/library')} />
      </ThemedView>
    );
  }

  function openStrategy(key: StrategyRow['key']) {
    if (key === 'tempo_ladder') {
      router.push(`/piece/${piece!.id}/tempo-ladder`);
    } else {
      Alert.alert('Coming soon', 'This practice strategy will be added in the next update.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">{piece.title}</ThemedText>
        {piece.composer && (
          <ThemedText style={[styles.composer, { color: C.icon }]}>{piece.composer}</ThemedText>
        )}
      </View>

      <ThemedText style={styles.sectionLabel}>Practice strategies</ThemedText>

      <View style={{ gap: Spacing.md }}>
        {STRATEGIES.map((s) => {
          const last = staleness[s.key];
          return (
            <Pressable
              key={s.key}
              onPress={() => openStrategy(s.key)}
              disabled={!s.enabled}
              style={[
                styles.strategyCard,
                {
                  borderColor: s.enabled ? C.tint : C.icon + '66',
                  backgroundColor: s.enabled ? C.tint + '11' : 'transparent',
                  opacity: s.enabled ? 1 : Opacity.muted,
                },
              ]}>
              <View style={{ flex: 1, gap: Spacing.xs }}>
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: s.enabled ? C.tint : C.text }}>
                  {s.label}
                </ThemedText>
                <ThemedText style={{ color: C.icon, fontSize: Type.size.sm, lineHeight: 18 }}>
                  {s.description}
                </ThemedText>
                {s.enabled && (
                  <ThemedText style={{ color: C.icon, fontSize: Type.size.xs }}>
                    Last practiced: {formatStaleness(last)}
                  </ThemedText>
                )}
              </View>
              {s.enabled && (
                <ThemedText style={[styles.chev, { color: C.tint }]}>›</ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  header: { gap: Spacing.xs },
  composer: { fontSize: Type.size.lg, opacity: 0.85 },
  sectionLabel: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.6,
  },
  strategyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: Borders.medium,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
  },
  chev: { fontSize: 28, fontWeight: '300' },
});
