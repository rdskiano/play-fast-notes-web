// Community Rhythm Library — browse & search. Free to everyone (the funnel):
// anyone can find, open, and download exercise PDFs. Creating/publishing is
// Pro, gated at the Exercise Builder. Reached from the Tools area and from the
// library search bar's "Community" scope (which passes ?q=).

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SessionTopBar } from '@/components/SessionTopBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  searchCommunityExercises,
  type CommunityExercise,
} from '@/lib/community/exercises';
import { exerciseShapeLabel } from '@/lib/community/exerciseConfig';
import { INSTRUMENTS } from '@/lib/music/pitch';

function instrumentLabel(id: string | null): string | null {
  if (!id) return null;
  return INSTRUMENTS.find((i) => i.id === id)?.label ?? id;
}

export default function CommunityScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(params.q ?? '');
  const [rows, setRows] = useState<CommunityExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instrumentFilter, setInstrumentFilter] = useState<string | null>(null);

  // Debounced server-side text search; instrument/repertoire filtering is
  // applied client-side on the result so chip taps are instant.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const handle = setTimeout(() => {
      searchCommunityExercises(query)
        .then((r) => {
          if (!alive) return;
          setRows(r);
          setError(null);
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : 'Could not load.');
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query]);

  const instrumentsPresent = useMemo(() => {
    const ids = new Set(rows.map((r) => r.instrument_id).filter(Boolean) as string[]);
    return INSTRUMENTS.filter((i) => ids.has(i.id));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => !instrumentFilter || r.instrument_id === instrumentFilter),
    [rows, instrumentFilter],
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Library"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Community
          </ThemedText>
        }
      />

      <View style={[styles.searchWrap, { borderColor: C.icon + '66' }]}>
        <ThemedText style={[styles.searchIcon, { color: C.icon }]}>⌕</ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises, pieces, composers, contributors"
          placeholderTextColor={C.icon}
          style={[styles.searchInput, { color: C.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <ThemedText style={[styles.searchClear, { color: C.icon }]}>✕</ThemedText>
          </Pressable>
        )}
      </View>

      {instrumentsPresent.length > 0 && (
        <View style={styles.filterRow}>
          {instrumentsPresent.map((i) => {
            const on = instrumentFilter === i.id;
            return (
              <Chip key={`i:${i.id}`} label={i.label} on={on} C={C}
                onPress={() => setInstrumentFilter(on ? null : i.id)} />
            );
          })}
        </View>
      )}

      {error ? (
        <View style={styles.empty}>
          <ThemedText style={{ color: '#c0392b', textAlign: 'center' }}>{error}</ThemedText>
        </View>
      ) : loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: Opacity.muted, textAlign: 'center' }}>
            {rows.length === 0
              ? "The community library is just getting started. Build a rhythm exercise and tap Share to be one of the first to contribute."
              : 'Nothing matches those filters.'}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl }}
          renderItem={({ item }) => {
            const work = [item.piece_title, item.composer].filter(Boolean).join(' — ');
            const meta = [instrumentLabel(item.instrument_id), exerciseShapeLabel(item.config_json)]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                onPress={() => router.push(`/community/${item.id}` as never)}
                style={[styles.card, { borderColor: C.icon + '44' }]}>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {item.title}
                </ThemedText>
                {work.length > 0 && (
                  <ThemedText style={[styles.cardMeta, { color: C.icon }]} numberOfLines={1}>
                    {work}
                  </ThemedText>
                )}
                <ThemedText style={[styles.cardMeta, { color: C.icon }]} numberOfLines={1}>
                  {meta}
                </ThemedText>
                <ThemedText style={[styles.cardBy, { color: C.icon }]} numberOfLines={1}>
                  by {item.contributor_name}
                </ThemedText>
              </Pressable>
            );
          }}
        />
      )}
    </ThemedView>
  );
}

function Chip({
  label,
  on,
  onPress,
  C,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  C: (typeof Colors)['light'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: C.icon + '88' },
        on && { backgroundColor: C.tint, borderColor: C.tint },
      ]}>
      <ThemedText style={[styles.chipText, on && { color: '#fff' }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radii.md,
  },
  searchIcon: { fontSize: Type.size.xl, fontWeight: Type.weight.bold },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  searchClear: { fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: Type.size.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
  card: { borderWidth: 1, borderRadius: Radii.md, padding: Spacing.md, gap: 2 },
  cardMeta: { fontSize: Type.size.sm },
  cardBy: { fontSize: Type.size.xs, marginTop: 2 },
});
