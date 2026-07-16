// Community Rhythm Library — browse & search. Free to everyone (the funnel):
// anyone can find, open, and download exercise PDFs. Creating/publishing is
// Pro, gated at the Exercise Builder. Reached from the Tools area and from the
// library search bar's "Community" scope (which passes ?q=).

import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/palette';
import { Colors, Fonts } from '@/constants/theme';
import { Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  searchCommunityExercises,
  updateExerciseTitle,
  type CommunityExercise,
} from '@/lib/community/exercises';
import { exerciseShapeLabel } from '@/lib/community/exerciseConfig';
import {
  getUid,
  loadBookmarks,
  loadVotes,
  setBookmark,
  setVote,
} from '@/lib/community/social';
import { INSTRUMENTS } from '@/lib/music/pitch';

function instrumentLabel(id: string | null): string | null {
  if (!id) return null;
  return INSTRUMENTS.find((i) => i.id === id)?.label ?? id;
}

export default function CommunityScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();
  const headerTopPad = Platform.OS === 'web' ? 56 : Math.max(insets.top, 12) + Spacing.sm;
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(params.q ?? '');
  const [rows, setRows] = useState<CommunityExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The signed-in user's id, so a card can show owner-only actions (⋯ menu).
  const [myUid, setMyUid] = useState<string | null>(null);
  // The exercise whose ⋯ menu is open, and the one being retitled (null = none).
  const [menuFor, setMenuFor] = useState<CommunityExercise | null>(null);
  const [editFor, setEditFor] = useState<CommunityExercise | null>(null);

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

  // Social signals: public upvotes (count + the user's own) and private
  // bookmarks. Loaded once on mount, best-effort (empty if the tables don't
  // exist yet), updated optimistically on tap.
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  // Frozen copy of the counts used for ORDERING only — captured at load and
  // not touched by live voting, so a card doesn't jump position the moment you
  // upvote it. Refreshes when the screen reloads / is revisited.
  const [sortSnapshot, setSortSnapshot] = useState<Record<string, number>>({});
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [myBookmarks, setMyBookmarks] = useState<Set<string>>(new Set());
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const uid = await getUid().catch(() => null);
      if (alive) setMyUid(uid);
      const [votes, marks] = await Promise.all([
        loadVotes(uid).catch(() => ({ counts: {}, mine: new Set<string>() })),
        loadBookmarks().catch(() => new Set<string>()),
      ]);
      if (!alive) return;
      setVoteCounts(votes.counts);
      setSortSnapshot(votes.counts);
      setMyVotes(votes.mine);
      setMyBookmarks(marks);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleBookmark = (id: string) => {
    const on = !myBookmarks.has(id);
    const flip = (add: boolean) =>
      setMyBookmarks((prev) => {
        const n = new Set(prev);
        if (add) n.add(id);
        else n.delete(id);
        return n;
      });
    flip(on);
    setBookmark(id, on).catch(() => flip(!on));
  };

  const toggleVote = (id: string) => {
    const on = !myVotes.has(id);
    const flipMine = (add: boolean) =>
      setMyVotes((prev) => {
        const n = new Set(prev);
        if (add) n.add(id);
        else n.delete(id);
        return n;
      });
    const bump = (delta: number) =>
      setVoteCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + delta) }));
    flipMine(on);
    bump(on ? 1 : -1);
    setVote(id, on).catch(() => {
      flipMine(!on);
      bump(on ? -1 : 1);
    });
  };

  // Save an edited title (owner-only, from the card ⋯ menu). Optimistically
  // patches the row so the card updates instantly; rolls back on failure.
  const saveTitle = (item: CommunityExercise, next: string) => {
    const clean = next.trim();
    setEditFor(null);
    if (clean.length === 0 || clean === item.title) return;
    const patch = (title: string) =>
      setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, title } : r)));
    patch(clean);
    updateExerciseTitle(item.id, clean).catch(() => patch(item.title));
  };

  // Apply the Saved filter, then order by upvotes (most-voted first; `rows`
  // already arrives newest-first, so that's the natural tiebreak).
  const filtered = useMemo(() => {
    const base = savedOnly ? rows.filter((r) => myBookmarks.has(r.id)) : rows;
    return [...base].sort((a, b) => (sortSnapshot[b.id] ?? 0) - (sortSnapshot[a.id] ?? 0));
  }, [rows, savedOnly, myBookmarks, sortSnapshot]);

  // View mode: a flat list of every exercise, or grouped under instrument
  // headers. Same data either way — purely how it's organized on screen.
  const [groupMode, setGroupMode] = useState<'instrument' | 'all'>('instrument');

  // Two-level grouping for the "By instrument" view: instrument → composer →
  // exercises. Same data, just organized; "Other" buckets sink to the bottom.
  const instrumentGroups = useMemo(() => {
    const sortTitle = (a: string, b: string) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    };
    const byInstrument = new Map<string, Map<string, CommunityExercise[]>>();
    for (const e of filtered) {
      const iKey = e.instrument_id ?? '__none__';
      const cKey = e.composer?.trim() || '__none__';
      let comp = byInstrument.get(iKey);
      if (!comp) {
        comp = new Map();
        byInstrument.set(iKey, comp);
      }
      const list = comp.get(cKey);
      if (list) list.push(e);
      else comp.set(cKey, [e]);
    }
    return [...byInstrument.entries()]
      .map(([iId, compMap]) => ({
        instrument: iId === '__none__' ? 'Other' : instrumentLabel(iId) ?? iId,
        count: [...compMap.values()].reduce((n, l) => n + l.length, 0),
        composers: [...compMap.entries()]
          .map(([cId, items]) => ({
            composer: cId === '__none__' ? 'Other' : cId,
            items,
          }))
          .sort((a, b) => sortTitle(a.composer, b.composer)),
      }))
      .sort((a, b) => sortTitle(a.instrument, b.instrument));
  }, [filtered]);

  const renderCard = (item: CommunityExercise, opts?: { hideComposer?: boolean }) => {
    const work = opts?.hideComposer
      ? item.piece_title ?? ''
      : [item.piece_title, item.composer].filter(Boolean).join(' — ');
    const meta = [instrumentLabel(item.instrument_id), exerciseShapeLabel(item.config_json)]
      .filter(Boolean)
      .join(' · ');
    const saved = myBookmarks.has(item.id);
    const voted = myVotes.has(item.id);
    const votes = voteCounts[item.id] ?? 0;
    const owned = !!myUid && item.contributor_user_id === myUid;
    return (
      <View style={[styles.card, { borderColor: Palette.border }]}>
        {owned && (
          <Pressable
            onPress={() => setMenuFor(item)}
            hitSlop={10}
            accessibilityLabel="Exercise options"
            style={styles.cardMenuBtn}>
            <Feather name="more-horizontal" size={20} color={C.icon} />
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push(`/community/${item.id}` as never)}
          style={{ gap: 3, paddingRight: owned ? 28 : 0 }}>
          {work.length > 0 ? (
            <>
              <ThemedText type="defaultSemiBold" numberOfLines={1}>
                {work}
              </ThemedText>
              <ThemedText style={styles.exerciseName} numberOfLines={1}>
                {item.title}
              </ThemedText>
            </>
          ) : (
            <ThemedText type="defaultSemiBold" numberOfLines={1}>
              {item.title}
            </ThemedText>
          )}
          <ThemedText style={[styles.cardMeta, { color: C.icon }]} numberOfLines={1}>
            {meta}
          </ThemedText>
        </Pressable>
        <View style={styles.cardActions}>
          <ThemedText style={[styles.cardBy, { color: C.icon, flex: 1 }]} numberOfLines={1}>
            by {item.contributor_name}
          </ThemedText>
          <Pressable
            onPress={() => toggleVote(item.id)}
            hitSlop={8}
            accessibilityLabel={voted ? 'Remove upvote' : 'Upvote'}
            style={[styles.voteBtn, voted && styles.voteBtnOn]}>
            <Feather name="arrow-up" size={15} color={voted ? '#fff' : Palette.textSecondary} />
            <ThemedText style={[styles.voteCount, voted && { color: '#fff' }]}>{votes}</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => toggleBookmark(item.id)}
            hitSlop={8}
            accessibilityLabel={saved ? 'Remove bookmark' : 'Save'}
            style={[styles.bookmarkBtn, saved && styles.bookmarkBtnOn]}>
            <MaterialIcons
              name={saved ? 'bookmark' : 'bookmark-border'}
              size={18}
              color={saved ? Palette.accent : Palette.textMuted}
            />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: headerTopPad }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ThemedText style={styles.backLink}>‹ Library</ThemedText>
        </Pressable>
        <ThemedText type="title">Community</ThemedText>
        <ThemedText style={styles.headerSub}>
          {rows.length} {rows.length === 1 ? 'exercise' : 'exercises'} shared ·
          exercises built by other players
        </ThemedText>
      </View>

      <View style={[styles.searchWrap, { borderColor: Palette.border }]}>
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

      {rows.length > 0 && (
        <View style={styles.segmentWrap}>
          <Pressable
            onPress={() => setGroupMode('instrument')}
            style={[styles.segment, groupMode === 'instrument' && styles.segmentOn]}>
            <ThemedText
              style={[styles.segmentText, groupMode === 'instrument' && styles.segmentTextOn]}>
              By instrument
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setGroupMode('all')}
            style={[styles.segment, groupMode === 'all' && styles.segmentOn]}>
            <ThemedText
              style={[styles.segmentText, groupMode === 'all' && styles.segmentTextOn]}>
              All exercises
            </ThemedText>
          </Pressable>
        </View>
      )}

      {rows.length > 0 && (
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setSavedOnly((v) => !v)}
            style={[styles.savedChip, savedOnly && styles.savedChipOn]}>
            <Feather
              name="bookmark"
              size={14}
              color={savedOnly ? '#fff' : Palette.textSecondary}
            />
            <ThemedText style={[styles.savedChipText, savedOnly && { color: '#fff' }]}>
              Saved
            </ThemedText>
          </Pressable>
        </View>
      )}

      {error ? (
        <View style={styles.empty}>
          <ThemedText style={{ color: Palette.danger, textAlign: 'center' }}>{error}</ThemedText>
        </View>
      ) : loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: Opacity.muted }}>Loading…</ThemedText>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: Opacity.muted, textAlign: 'center' }}>
            {savedOnly
              ? 'Nothing saved yet — tap the bookmark on an exercise to save it here.'
              : rows.length === 0
                ? "The community library is just getting started. Build a rhythm exercise and tap Share to be one of the first to contribute."
                : 'Nothing matches those filters.'}
          </ThemedText>
        </View>
      ) : groupMode === 'all' ? (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xl }}
          renderItem={({ item }) => renderCard(item)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.xl, paddingBottom: Spacing.xl }}>
          {instrumentGroups.map((g) => (
            <View key={g.instrument} style={{ gap: Spacing.md }}>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>{g.instrument}</ThemedText>
                <ThemedText style={styles.sectionCount}>
                  {g.count} {g.count === 1 ? 'exercise' : 'exercises'}
                </ThemedText>
              </View>
              {g.composers.map((c) => (
                <View key={c.composer} style={{ gap: Spacing.md }}>
                  <ThemedText style={styles.composerSub}>{c.composer}</ThemedText>
                  {c.items.map((item) => (
                    <View key={item.id}>{renderCard(item, { hideComposer: true })}</View>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        items={[
          {
            label: 'Edit title',
            onPress: () => {
              const it = menuFor;
              setMenuFor(null);
              setEditFor(it);
            },
          },
        ]}
        onCancel={() => setMenuFor(null)}
      />

      <PromptModal
        visible={!!editFor}
        title="Edit title"
        message="This is the name other players see in the community library."
        initialValue={editFor?.title ?? ''}
        placeholder="e.g. mvt. 4 sixteenths, mm. 281–291"
        submitLabel="Save"
        onSubmit={(v) => editFor && saveTitle(editFor, v)}
        onCancel={() => setEditFor(null)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  backLink: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.accent,
  },
  headerSub: {
    fontSize: Type.size.md,
    color: Palette.textSecondary,
    lineHeight: 19,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: Radii.xl,
    backgroundColor: Palette.card,
  },
  searchIcon: { fontSize: Type.size.xl, fontWeight: Type.weight.bold },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
  searchClear: { fontSize: Type.size.md, fontWeight: Type.weight.heavy },
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: 4,
    borderRadius: Radii.lg,
    backgroundColor: Palette.inset,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
  segmentOn: {
    backgroundColor: Palette.accent,
    shadowColor: 'rgb(20, 30, 30)',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segmentText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.textSecondary },
  segmentTextOn: { color: '#fff' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: Fonts.rounded,
    fontSize: Type.size.xl,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: Palette.text,
  },
  sectionCount: { fontSize: Type.size.sm, color: Palette.textMuted },
  composerSub: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
    color: Palette.text,
    marginBottom: -2,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
  card: {
    borderWidth: 1,
    borderRadius: Radii['2xl'],
    padding: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    shadowColor: 'rgb(20, 30, 30)',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardMenuBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    padding: 4,
    zIndex: 2,
  },
  exerciseName: { fontSize: Type.size.md, color: Palette.textSecondary },
  cardMeta: { fontSize: Type.size.sm },
  cardBy: { fontSize: Type.size.xs },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  voteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  voteBtnOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  voteCount: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    color: Palette.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  bookmarkBtn: {
    width: 34,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  bookmarkBtnOn: { backgroundColor: Palette.accentSoft, borderColor: Palette.accent },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Palette.border,
    backgroundColor: Palette.card,
  },
  savedChipOn: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  savedChipText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold, color: Palette.textSecondary },
});
