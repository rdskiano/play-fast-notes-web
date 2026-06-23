// Flat, fewer-clicks passage picker for Rep Rotator (v2 reskin).
//
// Replaces the old folder → PDF → tap-a-box file-tree picker. Passages are
// already marked per piece (name, mastery %, thumbnail), so the user selects
// them DIRECTLY from collapsible per-piece groups, searches across the whole
// library, randomizes a set, or recalls a saved set. The parent screen owns
// `selectedIds`; this component reports changes back through `onToggle` /
// `onSetSelected` and fires `onStart` when the user commits the rotation.

import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { Lift, Palette } from '@/constants/palette';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { HELP_CLEARANCE } from '@/lib/layout/configForm';
import { listAllDocuments, type DocumentRow } from '@/lib/db/repos/documents';
import { parseRegions, type Passage } from '@/lib/db/repos/passages';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import { getTempoLadderProgressForPassages } from '@/lib/db/repos/tempoLadder';

// settings key for the per-user saved-set library (JSON array, no migration).
const SAVED_SETS_KEY = 'interleave_sets';

type SavedSet = { id: string; name: string; passageIds: string[] };

// Soft-tint chip colors cycled across the piece groups so selected chips read
// as a colorful set — same palette vocabulary as the library folder grid.
const PIECE_TINTS = [
  { bg: Palette.accentSoft, fg: Palette.accent },
  { bg: Palette.rhythmicSoft, fg: Palette.rhythmic },
  { bg: Palette.interleavedSoft, fg: Palette.interleaved },
  { bg: Palette.successSoft, fg: Palette.success },
] as const;

const LOOSE_KEY = '__loose__';

// Mastery ramp (Tempo Ladder % toward goal) — Ralph's picker-specific bands.
function masteryColor(pct: number): string {
  if (pct >= 80) return Palette.success;
  if (pct >= 55) return '#E0863A';
  return Palette.danger;
}

type PieceGroup = {
  key: string;
  title: string;
  composer: string | null;
  thumbnailUri: string | null;
  passages: Passage[];
};

// Page orientation subtext for a document-backed passage ("Page 3" /
// "Pages 4–5"). The passage row has no measures field, so the page range is
// the closest honest "where in the score" hint.
function pageHint(p: Passage): string | null {
  const regions = parseRegions(p.regions_json);
  if (regions.length === 0) return null;
  const pages = [...new Set(regions.map((r) => r.page))].sort((a, b) => a - b);
  if (pages.length === 1) return `Page ${pages[0]}`;
  return `Pages ${pages[0]}–${pages[pages.length - 1]}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PassagePicker({
  selectedIds,
  passages,
  onToggle,
  onSetSelected,
  onStart,
  onExit,
  minToStart = 2,
  startLabel = 'Start interleaving',
}: {
  /** Currently-selected passage ids, in selection order (parent-owned). */
  selectedIds: string[];
  /** Every passage in the library. */
  passages: Passage[];
  /** Toggle a single passage in/out of the selection. */
  onToggle: (passageId: string) => void;
  /** Replace the whole selection (randomize, clear, recall a saved set). */
  onSetSelected: (ids: string[]) => void;
  /** Commit the rotation — enabled once `minToStart` passages are picked. */
  onStart: () => void;
  /** Leave the picker (back to wherever the user came from). */
  onExit: () => void;
  minToStart?: number;
  startLabel?: string;
}) {
  const insets = useSafeAreaInsets();

  // ── Supporting data: piece titles (documents) + mastery % (Tempo Ladder) ──
  const [docs, setDocs] = useState<Map<string, DocumentRow>>(new Map());
  const [mastery, setMastery] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    listAllDocuments()
      .then((ds) => {
        if (cancelled) return;
        setDocs(new Map(ds.map((d) => [d.id, d])));
      })
      .catch((err) => console.error('[picker] listAllDocuments failed', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (passages.length === 0) {
      setMastery({});
      return;
    }
    getTempoLadderProgressForPassages(passages.map((p) => p.id))
      .then((rows) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const r of rows) {
          if (r.goal_tempo > 0) {
            map[r.piece_id] = Math.max(
              0,
              Math.min(100, Math.round((r.current_tempo / r.goal_tempo) * 100)),
            );
          }
        }
        setMastery(map);
      })
      .catch((err) => console.error('[picker] tempo ladder progress failed', err));
    return () => {
      cancelled = true;
    };
  }, [passages]);

  // ── Saved sets ────────────────────────────────────────────────────────────
  const [savedSets, setSavedSets] = useState<SavedSet[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSetting(SAVED_SETS_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setSavedSets(parsed as SavedSet[]);
        } catch {
          // ignore a corrupt blob — start from an empty set library
        }
      })
      .catch((err) => console.error('[picker] load saved sets failed', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSets = useCallback((next: SavedSet[]) => {
    setSavedSets(next);
    setSetting(SAVED_SETS_KEY, JSON.stringify(next)).catch((err) =>
      console.error('[picker] persist saved sets failed', err),
    );
  }, []);

  function saveCurrentSet(name: string) {
    const clean = name.trim();
    if (!clean || selectedIds.length < 2) return;
    persistSets([
      ...savedSets,
      { id: `${Date.now()}`, name: clean, passageIds: [...selectedIds] },
    ]);
  }

  function deleteSet(id: string) {
    persistSets(savedSets.filter((s) => s.id !== id));
  }

  function applySet(set: SavedSet) {
    // Drop any ids no longer in the library so a stale set can't seed ghosts.
    const live = set.passageIds.filter((id) => passages.some((p) => p.id === id));
    onSetSelected(live);
  }

  // ── Grouping: by document (piece); loose photos in one bucket ─────────────
  const groups = useMemo<PieceGroup[]>(() => {
    const byKey = new Map<string, PieceGroup>();
    for (const p of passages) {
      const key = p.document_id ?? LOOSE_KEY;
      let g = byKey.get(key);
      if (!g) {
        const doc = p.document_id ? docs.get(p.document_id) : undefined;
        g = {
          key,
          title: p.document_id
            ? doc?.title ?? 'Untitled piece'
            : 'Loose passages',
          composer: p.document_id ? doc?.composer ?? p.composer : null,
          thumbnailUri: null,
          passages: [],
        };
        byKey.set(key, g);
      }
      g.passages.push(p);
      if (!g.thumbnailUri) g.thumbnailUri = p.thumbnail_uri ?? p.source_uri ?? null;
    }
    const list = [...byKey.values()];
    // Alphabetical by title, loose bucket always last.
    list.sort((a, b) => {
      if (a.key === LOOSE_KEY) return 1;
      if (b.key === LOOSE_KEY) return -1;
      return a.title.localeCompare(b.title);
    });
    return list;
  }, [passages, docs]);

  // Map each passage to its group index → chip tint.
  const tintByPassage = useMemo(() => {
    const m = new Map<string, (typeof PIECE_TINTS)[number]>();
    groups.forEach((g, i) => {
      const tint = PIECE_TINTS[i % PIECE_TINTS.length];
      for (const p of g.passages) m.set(p.id, tint);
    });
    return m;
  }, [groups]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ── Search ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const searchActive = q.length > 0;

  const matchesQuery = useCallback(
    (g: PieceGroup): { group: boolean; passages: Set<string> } => {
      if (!searchActive) return { group: true, passages: new Set() };
      const groupHit =
        g.title.toLowerCase().includes(q) ||
        (g.composer?.toLowerCase().includes(q) ?? false);
      const passageHits = new Set(
        g.passages.filter((p) => p.title.toLowerCase().includes(q)).map((p) => p.id),
      );
      return { group: groupHit || passageHits.size > 0, passages: passageHits };
    },
    [q, searchActive],
  );

  // ── Expand / collapse ─────────────────────────────────────────────────────
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});
  const isExpanded = useCallback(
    (g: PieceGroup): boolean => {
      if (searchActive) return true; // search reveals every matching group
      if (g.key in manualExpanded) return manualExpanded[g.key];
      const hasSelected = g.passages.some((p) => selectedSet.has(p.id));
      return hasSelected || groups.length === 1;
    },
    [manualExpanded, searchActive, selectedSet, groups.length],
  );
  function toggleExpand(g: PieceGroup) {
    setManualExpanded((prev) => ({ ...prev, [g.key]: !isExpanded(g) }));
  }

  // ── Randomize ─────────────────────────────────────────────────────────────
  const [randomOpen, setRandomOpen] = useState(false);
  const total = passages.length;
  const [count, setCount] = useState(2);
  // Seed the requested count to a sensible default once passages load.
  useEffect(() => {
    setCount((c) => Math.max(2, Math.min(total || 2, c === 2 ? Math.min(4, total) : c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  const clampCount = (n: number) => Math.max(2, Math.min(total, n));

  function randomizeFrom(scopeIds: string[]) {
    const n = Math.min(count, scopeIds.length);
    onSetSelected(shuffle(scopeIds).slice(0, n));
    setRandomOpen(false);
  }

  const selectedCount = selectedIds.length;
  const canStart = selectedCount >= minToStart;

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderMastery(p: Passage) {
    const pct = mastery[p.id];
    if (pct == null) {
      return <ThemedText style={styles.masteryNone}>—</ThemedText>;
    }
    const color = masteryColor(pct);
    return (
      <View style={styles.masteryBadge}>
        <View style={[styles.masteryDot, { backgroundColor: color }]} />
        <ThemedText style={[styles.masteryPct, { color }]}>{pct}%</ThemedText>
      </View>
    );
  }

  function renderPassageRow(p: Passage) {
    const selected = selectedSet.has(p.id);
    const hint = pageHint(p);
    return (
      <Pressable
        key={p.id}
        onPress={() => onToggle(p.id)}
        style={[
          styles.passageRow,
          selected && { backgroundColor: Palette.accentSoft, borderColor: Palette.accent },
        ]}>
        <View
          style={[
            styles.checkbox,
            selected
              ? { backgroundColor: Palette.accent, borderColor: Palette.accent }
              : { borderColor: Palette.borderStrong },
          ]}>
          {selected && <Feather name="check" size={14} color="#fff" />}
        </View>
        <View style={styles.passageText}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {p.title || 'Untitled'}
          </ThemedText>
          {hint ? <ThemedText style={styles.passageHint}>{hint}</ThemedText> : null}
        </View>
        {renderMastery(p)}
      </Pressable>
    );
  }

  function renderGroup(g: PieceGroup) {
    const match = matchesQuery(g);
    if (!match.group) return null;
    const expanded = isExpanded(g);
    const visiblePassages =
      searchActive && match.passages.size > 0
        ? g.passages.filter((p) => match.passages.has(p.id))
        : g.passages;
    const pickedInGroup = g.passages.filter((p) => selectedSet.has(p.id)).length;
    return (
      <View key={g.key} style={styles.groupCard}>
        <Pressable style={styles.groupHeader} onPress={() => toggleExpand(g)}>
          {g.thumbnailUri ? (
            <Image source={{ uri: g.thumbnailUri }} style={styles.groupThumb} contentFit="cover" />
          ) : (
            <View style={[styles.groupThumb, { backgroundColor: Palette.surfaceSunk }]} />
          )}
          <View style={styles.groupTitleCol}>
            <ThemedText type="defaultSemiBold" numberOfLines={1}>
              {g.title}
            </ThemedText>
            {g.composer ? (
              <ThemedText style={styles.groupComposer} numberOfLines={1}>
                {g.composer}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText
            style={[
              styles.groupPicked,
              { color: pickedInGroup > 0 ? Palette.accent : Palette.textMuted },
            ]}>
            {pickedInGroup} of {g.passages.length}
          </ThemedText>
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Palette.textMuted}
          />
        </Pressable>
        {expanded && (
          <View style={styles.groupBody}>{visiblePassages.map(renderPassageRow)}</View>
        )}
      </View>
    );
  }

  const anyVisible = groups.some((g) => matchesQuery(g).group);

  return (
    <View style={styles.fill}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.sm }]}
        keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View
          style={styles.backRow}
          onStartShouldSetResponder={() => true}
          onResponderRelease={onExit}>
          <Feather name="chevron-left" size={18} color={Palette.accent} />
          <ThemedText style={styles.backText}>Back</ThemedText>
        </View>
        <View style={styles.titleRow}>
          <View style={styles.titleCol}>
            <ThemedText type="title">Interleave passages</ThemedText>
            <ThemedText style={styles.subtitle}>
              Pick 2 or more from any piece — mixing spots beats drilling one on repeat.
            </ThemedText>
          </View>
          <View
            style={[
              styles.pickedChip,
              selectedCount > 0
                ? { backgroundColor: Palette.accent }
                : { backgroundColor: Palette.surfaceSunk },
            ]}>
            <ThemedText
              style={[
                styles.pickedChipText,
                { color: selectedCount > 0 ? '#fff' : Palette.textMuted },
              ]}>
              {selectedCount} picked
            </ThemedText>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={Palette.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search pieces and passages"
            placeholderTextColor={Palette.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <View onStartShouldSetResponder={() => true} onResponderRelease={() => setQuery('')}>
              <Feather name="x" size={16} color={Palette.textMuted} />
            </View>
          )}
        </View>

        {/* Quick-start: Randomize + saved sets · count picker */}
        <View style={styles.quickRow}>
          <View style={styles.quickLeft}>
            <Chip
              onPress={() => setRandomOpen((o) => !o)}
              style={[
                styles.randomizeChip,
                randomOpen && { borderColor: Palette.accent, borderWidth: Borders.thick },
              ]}>
              <Feather name="shuffle" size={14} color={Palette.accent} />
              <ThemedText style={styles.randomizeText}>Randomize</ThemedText>
              <Feather
                name={randomOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={Palette.accent}
              />
            </Chip>
            {savedSets.map((set) => (
              <Chip key={set.id} onPress={() => applySet(set)} style={styles.setChip}>
                <ThemedText style={styles.setChipText} numberOfLines={1}>
                  {set.name}
                </ThemedText>
                <View
                  onStartShouldSetResponder={() => true}
                  onResponderRelease={() => deleteSet(set.id)}
                  hitSlop={8}>
                  <Feather name="x" size={13} color={Palette.textMuted} />
                </View>
              </Chip>
            ))}
          </View>
          <View style={styles.countPicker}>
            <Stepper
              label="−"
              onPress={() => setCount((c) => clampCount(c - 1))}
              disabled={count <= 2}
            />
            <ThemedText style={styles.countValue}>{count}</ThemedText>
            <Stepper
              label="+"
              onPress={() => setCount((c) => clampCount(c + 1))}
              disabled={count >= total}
            />
          </View>
        </View>

        {/* Randomize dropdown (inline, no overlay) */}
        {randomOpen && (
          <View style={styles.dropdown}>
            <ThemedText style={styles.dropdownHeader}>Randomly pick {count} from</ThemedText>
            <DropdownOption
              label="Anywhere in my library"
              meta={`${total} passages`}
              onPress={() => randomizeFrom(passages.map((p) => p.id))}
            />
            {groups.map((g) => (
              <DropdownOption
                key={g.key}
                thumbnailUri={g.thumbnailUri}
                label={g.title}
                meta={`${g.passages.length} passage${g.passages.length === 1 ? '' : 's'}`}
                onPress={() => randomizeFrom(g.passages.map((p) => p.id))}
              />
            ))}
          </View>
        )}

        {/* Piece groups */}
        {total === 0 ? (
          <ThemedText style={styles.empty}>
            No passages yet. Add a piece in your library first.
          </ThemedText>
        ) : !anyVisible ? (
          <ThemedText style={styles.empty}>No pieces match “{query}”.</ThemedText>
        ) : (
          groups.map(renderGroup)
        )}
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}>
        {selectedCount > 0 && (
          <View style={styles.chipsRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
              keyboardShouldPersistTaps="handled">
              {selectedIds.map((id) => {
                const p = passages.find((x) => x.id === id);
                if (!p) return null;
                const tint = tintByPassage.get(id) ?? PIECE_TINTS[0];
                return (
                  <View key={id} style={[styles.selChip, { backgroundColor: tint.bg }]}>
                    <ThemedText
                      style={[styles.selChipText, { color: tint.fg }]}
                      numberOfLines={1}>
                      {p.title || 'Untitled'}
                    </ThemedText>
                    <View
                      onStartShouldSetResponder={() => true}
                      onResponderRelease={() => onToggle(id)}
                      hitSlop={6}>
                      <Feather name="x" size={13} color={tint.fg} />
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View
              onStartShouldSetResponder={() => true}
              onResponderRelease={() => onSetSelected([])}>
              <ThemedText style={styles.clearText}>Clear</ThemedText>
            </View>
          </View>
        )}
        <View style={styles.bottomActions}>
          {selectedCount >= 2 && (
            <Button
              label="Save set"
              variant="outline"
              size="sm"
              onPress={() => setSaveOpen(true)}
            />
          )}
          <View style={styles.bottomCta}>
            <Button
              label={canStart ? `${startLabel} · ${selectedCount}` : `Pick at least ${minToStart} passages`}
              onPress={onStart}
              disabled={!canStart}
            />
          </View>
        </View>
      </View>

      <PromptModal
        visible={saveOpen}
        title="Save this set"
        message="Give this group of passages a name so you can re-pick it later."
        placeholder="e.g. Audition round"
        submitLabel="Save"
        onSubmit={(name) => {
          setSaveOpen(false);
          saveCurrentSet(name);
        }}
        onCancel={() => setSaveOpen(false)}
      />
    </View>
  );
}

// Small rounded chip used for Randomize + saved-set pills. Plain View with a
// responder so nested ✕ buttons keep their own press handling.
function Chip({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.chip, style]}
      onStartShouldSetResponder={() => true}
      onResponderRelease={onPress}>
      {children}
    </View>
  );
}

function Stepper({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={[styles.stepBtn, disabled && { opacity: 0.35 }]}
      onStartShouldSetResponder={() => !disabled}
      onResponderRelease={() => {
        if (!disabled) onPress();
      }}>
      <ThemedText style={styles.stepGlyph}>{label}</ThemedText>
    </View>
  );
}

function DropdownOption({
  label,
  meta,
  thumbnailUri,
  onPress,
}: {
  label: string;
  meta: string;
  thumbnailUri?: string | null;
  onPress: () => void;
}) {
  return (
    <View
      style={styles.dropdownOption}
      onStartShouldSetResponder={() => true}
      onResponderRelease={onPress}>
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={styles.dropdownThumb} contentFit="cover" />
      ) : (
        <View style={[styles.dropdownThumb, { backgroundColor: Palette.accentSoft }]}>
          <Feather name="book-open" size={14} color={Palette.accent} />
        </View>
      )}
      <ThemedText type="defaultSemiBold" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={styles.dropdownMeta}>{meta}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { color: Palette.accent, fontWeight: Type.weight.semibold, fontSize: Type.size.md },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  titleCol: { flex: 1, gap: Spacing.xs },
  subtitle: {
    color: Palette.textSecondary,
    fontSize: Type.size.md,
    lineHeight: 20,
  },
  pickedChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    marginTop: 4,
  },
  pickedChipText: { fontSize: Type.size.sm, fontWeight: Type.weight.heavy },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.xl,
    paddingHorizontal: Spacing.md,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.size.md,
    color: Palette.text,
  },

  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  quickLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radii.pill,
  },
  randomizeChip: {
    backgroundColor: Palette.accentSoft,
    borderWidth: Borders.thin,
    borderColor: Palette.accent + '44',
  },
  randomizeText: { color: Palette.accent, fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  setChip: {
    backgroundColor: Palette.surfaceSunk,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    maxWidth: 160,
  },
  setChipText: {
    color: Palette.text,
    fontWeight: Type.weight.semibold,
    fontSize: Type.size.sm,
    flexShrink: 1,
  },

  countPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Palette.surfaceSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 18, fontWeight: Type.weight.heavy, color: Palette.text, lineHeight: 20 },
  countValue: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    color: Palette.text,
    fontVariant: ['tabular-nums'],
  },

  dropdown: {
    backgroundColor: Palette.card,
    // Petrol outline so the open randomize panel reads as a distinct, active
    // dropdown rather than blending into the piece cards below it.
    borderWidth: Borders.thick,
    borderColor: Palette.accent,
    borderRadius: Radii['2xl'],
    padding: Spacing.sm,
    gap: 2,
    ...Lift,
  },
  dropdownHeader: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
    color: Palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.lg,
  },
  dropdownThumb: {
    width: 32,
    height: 32,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownMeta: { fontSize: Type.size.xs, color: Palette.textMuted },

  groupCard: {
    backgroundColor: Palette.card,
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii['2xl'],
    ...Lift,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  groupThumb: { width: 44, height: 44, borderRadius: Radii.md },
  groupTitleCol: { flex: 1, gap: 1 },
  groupComposer: { color: Palette.textSecondary, fontSize: Type.size.sm },
  groupPicked: { fontSize: Type.size.sm, fontWeight: Type.weight.bold, fontVariant: ['tabular-nums'] },
  groupBody: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: 6,
  },

  passageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: Borders.thin,
    borderColor: 'transparent',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: Borders.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passageText: { flex: 1, gap: 1 },
  passageHint: { color: Palette.textMuted, fontSize: Type.size.xs },
  masteryBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  masteryDot: { width: 8, height: 8, borderRadius: 4 },
  masteryPct: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
    fontVariant: ['tabular-nums'],
  },
  masteryNone: { color: Palette.textMuted, fontSize: Type.size.sm, opacity: 0.5 },

  empty: {
    textAlign: 'center',
    color: Palette.textMuted,
    paddingVertical: Spacing.xl,
    fontSize: Type.size.md,
  },

  bottomBar: {
    borderTopWidth: Borders.thin,
    borderTopColor: Palette.border,
    backgroundColor: Palette.paper,
    paddingLeft: Spacing.lg,
    // Extra right padding keeps the CTA clear of the global floating "?" help
    // button (fixed bottom-right, ~60px) so they don't overlap.
    paddingRight: HELP_CLEARANCE,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chipsScroll: { gap: Spacing.sm, alignItems: 'center', paddingRight: Spacing.sm },
  selChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    maxWidth: 180,
  },
  selChipText: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold, flexShrink: 1 },
  clearText: { color: Palette.textSecondary, fontWeight: Type.weight.semibold, fontSize: Type.size.sm },

  bottomActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  bottomCta: { flex: 1 },
});
