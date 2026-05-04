import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { SessionTopBar } from '@/components/SessionTopBar';
import { useStrategyColors } from '@/components/StrategyColorsContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listAllFolders, type Folder } from '@/lib/db/repos/folders';
import {
  deletePracticeLog,
  getPracticeLogForLibrary,
  updatePracticeLogMoodNote,
  type LibraryPracticeLogEntry,
} from '@/lib/db/repos/practiceLog';

const STRATEGY_LABELS: Record<string, string> = {
  tempo_ladder: 'TL',
  click_up: 'ICU',
  rhythmic: 'RV',
  interleaved: 'Serial',
  chunking: 'Chunking',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDetail(entry: LibraryPracticeLogEntry): string | null {
  if (!entry.data_json) return null;
  try {
    const data = JSON.parse(entry.data_json);
    if (entry.strategy === 'tempo_ladder' && data.tempo) return `${data.tempo} BPM`;
    if (entry.strategy === 'click_up' && data.step != null && data.totalSteps)
      return `${data.step + 1}/${data.totalSteps}`;
    if (entry.strategy === 'interleaved') {
      const parts: string[] = [];
      if (typeof data.tempo === 'number') parts.push(`${data.tempo} BPM`);
      if (data.completed) parts.push('✓');
      return parts.length > 0 ? parts.join(' ') : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function entryLabel(e: LibraryPracticeLogEntry): string {
  const label = STRATEGY_LABELS[e.strategy] ?? e.strategy;
  const exercise =
    e.exercise_name && e.exercise_name.trim().length > 0 ? e.exercise_name : null;
  const detail = formatDetail(e);
  const { mood } = parseMoodNote(e);
  const parts = [label];
  if (exercise) parts.push(exercise);
  if (detail) parts.push(detail);
  if (mood) parts.push(mood);
  return parts.join(' · ');
}

function parseMoodNote(entry: LibraryPracticeLogEntry): {
  mood: string | null;
  note: string | null;
} {
  if (!entry.data_json) return { mood: null, note: null };
  try {
    const data = JSON.parse(entry.data_json);
    return {
      mood: typeof data.mood === 'string' ? data.mood : null,
      note: typeof data.note === 'string' ? data.note : null,
    };
  } catch {
    return { mood: null, note: null };
  }
}

type ViewMode = 'date' | 'folder';

type PassageGroup = {
  passageTitle: string;
  folderName: string | null;
  entries: LibraryPracticeLogEntry[];
};

type DayFolderGroup = {
  folderId: string | null;
  folderName: string;
  passages: PassageGroup[];
};

type DayGroup = { dateLabel: string; folders: DayFolderGroup[] };

type FolderDayGroup = {
  dateLabel: string;
  passages: PassageGroup[];
};

type FolderGroup = {
  folderId: string | null;
  folderName: string;
  dayGroups: FolderDayGroup[];
};

export default function LibraryLogScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors: STRATEGY_COLORS } = useStrategyColors();

  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [entries, setEntries] = useState<LibraryPracticeLogEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [editing, setEditing] = useState<LibraryPracticeLogEntry | null>(null);

  const refresh = useCallback(async () => {
    const [ents, flds] = await Promise.all([
      getPracticeLogForLibrary(),
      listAllFolders(),
    ]);
    setEntries(ents);
    setFolders(flds);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const editingParsed = editing ? parseMoodNote(editing) : null;

  async function onEditSubmit(payload: { mood: string | null; note: string | null }) {
    if (!editing) return;
    await updatePracticeLogMoodNote(editing.id, payload);
    setEditing(null);
    refresh();
  }

  function onEditDelete() {
    if (!editing) return;
    const target = editing;
    const performDelete = async () => {
      await deletePracticeLog(target.id);
      setEditing(null);
      refresh();
    };
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm('Delete this log entry? This cannot be undone.');
      if (ok) performDelete();
      return;
    }
    Alert.alert('Delete this log entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  }

  // ── By-date grouping: day → folder → passage → pills ─────────────────────
  // Folder order within a day follows the Library's folder sort order;
  // "Unfiled" (folder_id = null) comes last.
  const folderOrderIndex = new Map<string | null, number>();
  folders.forEach((f, idx) => folderOrderIndex.set(f.id, idx));
  folderOrderIndex.set(null, folders.length);

  const dayGroups: DayGroup[] = [];
  {
    const dayMap = new Map<
      string,
      {
        dateLabel: string;
        folderMap: Map<string | null, {
          folderName: string;
          passageMap: Map<string, PassageGroup>;
        }>;
      }
    >();
    for (const e of entries) {
      const dk = dateKey(e.practiced_at);
      if (!dayMap.has(dk)) {
        dayMap.set(dk, {
          dateLabel: formatDate(e.practiced_at),
          folderMap: new Map(),
        });
      }
      const day = dayMap.get(dk)!;
      const fKey = e.folder_id ?? null;
      if (!day.folderMap.has(fKey)) {
        day.folderMap.set(fKey, {
          folderName:
            fKey === null
              ? 'Unfiled'
              : e.folder_name || folders.find((f) => f.id === fKey)?.name || 'Folder',
          passageMap: new Map(),
        });
      }
      const folder = day.folderMap.get(fKey)!;
      if (!folder.passageMap.has(e.piece_id)) {
        folder.passageMap.set(e.piece_id, {
          passageTitle: e.piece_title || 'Untitled',
          folderName: e.folder_name,
          entries: [],
        });
      }
      folder.passageMap.get(e.piece_id)!.entries.push(e);
    }
    for (const day of dayMap.values()) {
      const folderKeys = Array.from(day.folderMap.keys()).sort(
        (a, b) =>
          (folderOrderIndex.get(a) ?? 9999) - (folderOrderIndex.get(b) ?? 9999),
      );
      const dayFolders: DayFolderGroup[] = folderKeys.map((fKey) => {
        const f = day.folderMap.get(fKey)!;
        return {
          folderId: fKey,
          folderName: f.folderName,
          passages: Array.from(f.passageMap.values()),
        };
      });
      dayGroups.push({
        dateLabel: day.dateLabel,
        folders: dayFolders,
      });
    }
  }

  // ── By-folder grouping: folder → day → pills ───────────────────────────
  const folderGroups: FolderGroup[] = [];
  {
    const folderOrder = new Map<string | null, number>();
    folders.forEach((f, idx) => folderOrder.set(f.id, idx));
    folderOrder.set(null, folders.length); // unfiled last

    const byFolder = new Map<string | null, LibraryPracticeLogEntry[]>();
    for (const e of entries) {
      const key = e.folder_id ?? null;
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(e);
    }

    const keys = Array.from(byFolder.keys()).sort(
      (a, b) => (folderOrder.get(a) ?? 9999) - (folderOrder.get(b) ?? 9999),
    );
    for (const key of keys) {
      const list = byFolder.get(key) ?? [];
      if (list.length === 0) continue;
      const folderName =
        key === null
          ? 'Unfiled'
          : list[0].folder_name || folders.find((f) => f.id === key)?.name || 'Folder';
      const dayMap = new Map<
        string,
        { dateLabel: string; passageMap: Map<string, PassageGroup> }
      >();
      for (const e of list) {
        const dk = dateKey(e.practiced_at);
        if (!dayMap.has(dk)) {
          dayMap.set(dk, {
            dateLabel: formatDate(e.practiced_at),
            passageMap: new Map(),
          });
        }
        const day = dayMap.get(dk)!;
        if (!day.passageMap.has(e.piece_id)) {
          day.passageMap.set(e.piece_id, {
            passageTitle: e.piece_title || 'Untitled',
            folderName: e.folder_name,
            entries: [],
          });
        }
        day.passageMap.get(e.piece_id)!.entries.push(e);
      }
      folderGroups.push({
        folderId: key,
        folderName,
        dayGroups: Array.from(dayMap.values()).map((d) => ({
          dateLabel: d.dateLabel,
          passages: Array.from(d.passageMap.values()),
        })),
      });
    }
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SessionTopBar
        onExit={() => router.back()}
        exitLabel="‹ Library"
        center={
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            Practice log
          </ThemedText>
        }
      />

      <View style={styles.toggleRow}>
        {(['date', 'folder'] as ViewMode[]).map((m) => {
          const selected = viewMode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setViewMode(m)}
              style={[
                styles.toggleBtn,
                {
                  borderColor: selected ? C.tint : C.icon,
                  backgroundColor: selected ? C.tint : 'transparent',
                },
              ]}>
              <ThemedText
                style={{
                  color: selected ? '#fff' : C.text,
                  fontWeight: '700',
                  fontSize: 13,
                }}>
                {m === 'date' ? 'By date' : 'By folder'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={{ opacity: 0.6, textAlign: 'center' }}>
            No practice sessions recorded yet.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {viewMode === 'date'
            ? dayGroups.map((day, i) => (
                <View
                  key={i}
                  style={[
                    styles.dayBlock,
                    { borderColor: C.icon + '55', backgroundColor: C.icon + '08' },
                  ]}>
                  <View
                    style={[styles.dayHeaderBar, { backgroundColor: C.tint }]}>
                    <ThemedText style={styles.dayHeaderText}>
                      {day.dateLabel}
                    </ThemedText>
                  </View>
                  {day.folders.map((folder, fi) => (
                    <View
                      key={fi}
                      style={[
                        styles.folderSection,
                        fi > 0 && { borderTopColor: C.icon + '33', borderTopWidth: 1 },
                      ]}>
                      <View style={styles.folderLabelRow}>
                        <View
                          style={[styles.folderBar, { backgroundColor: C.tint }]}
                        />
                        <ThemedText
                          style={[styles.folderLabel, { color: C.text }]}
                          numberOfLines={1}>
                          {folder.folderName}
                        </ThemedText>
                      </View>
                      <View style={styles.grid}>
                        {folder.passages.map((pg, j) => (
                          <View
                            key={j}
                            style={[styles.card, { borderColor: C.icon + '33' }]}>
                            <ThemedText style={styles.passageName} numberOfLines={1}>
                              {pg.passageTitle}
                            </ThemedText>
                            <View style={styles.pillRow}>
                              {pg.entries.map((e) => (
                                <Pressable
                                  key={e.id}
                                  onPress={() => setEditing(e)}
                                  style={[
                                    styles.pill,
                                    {
                                      backgroundColor:
                                        STRATEGY_COLORS[e.strategy] ?? C.icon,
                                    },
                                  ]}>
                                  <ThemedText style={styles.pillText} numberOfLines={1}>
                                    {entryLabel(e)}
                                  </ThemedText>
                                </Pressable>
                              ))}
                            </View>
                            {pg.entries.some((e) => parseMoodNote(e).note) && (
                              <View style={styles.notesList}>
                                {pg.entries.map((e) => {
                                  const { note } = parseMoodNote(e);
                                  if (!note) return null;
                                  return (
                                    <ThemedText
                                      key={e.id}
                                      style={[styles.noteText, { color: C.icon }]}
                                      numberOfLines={2}>
                                      {note}
                                    </ThemedText>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            : folderGroups.map((fg, i) => (
                <View
                  key={i}
                  style={[
                    styles.dayBlock,
                    { borderColor: C.icon + '55', backgroundColor: C.icon + '08' },
                  ]}>
                  <View
                    style={[styles.dayHeaderBar, { backgroundColor: C.tint }]}>
                    <ThemedText style={styles.dayHeaderText}>
                      {fg.folderName}
                    </ThemedText>
                  </View>
                  {fg.dayGroups.map((dg, j) => (
                    <View
                      key={j}
                      style={[
                        styles.folderSection,
                        j > 0 && { borderTopColor: C.icon + '33', borderTopWidth: 1 },
                      ]}>
                      <View style={styles.folderLabelRow}>
                        <View
                          style={[styles.folderBar, { backgroundColor: C.tint }]}
                        />
                        <ThemedText
                          style={[styles.folderLabel, { color: C.text }]}
                          numberOfLines={1}>
                          {dg.dateLabel}
                        </ThemedText>
                      </View>
                      <View style={styles.passageStack}>
                        {dg.passages.map((pg, k) => (
                          <View
                            key={k}
                            style={[styles.passageRow, { borderColor: C.tint + '88' }]}>
                            <ThemedText style={styles.passageName} numberOfLines={1}>
                              {pg.passageTitle}
                            </ThemedText>
                            <View style={styles.pillRow}>
                              {pg.entries.map((e) => (
                                <Pressable
                                  key={e.id}
                                  onPress={() => setEditing(e)}
                                  style={[
                                    styles.pill,
                                    {
                                      backgroundColor:
                                        STRATEGY_COLORS[e.strategy] ?? C.icon,
                                    },
                                  ]}>
                                  <ThemedText
                                    style={styles.pillText}
                                    numberOfLines={1}>
                                    {entryLabel(e)}
                                  </ThemedText>
                                </Pressable>
                              ))}
                            </View>
                            {pg.entries.some((e) => parseMoodNote(e).note) && (
                              <View style={styles.notesList}>
                                {pg.entries.map((e) => {
                                  const { note } = parseMoodNote(e);
                                  if (!note) return null;
                                  return (
                                    <ThemedText
                                      key={e.id}
                                      style={[styles.noteText, { color: C.icon }]}
                                      numberOfLines={2}>
                                      {note}
                                    </ThemedText>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
        </ScrollView>
      )}

      <PracticeLogNotePrompt
        visible={editing !== null}
        title="Edit log entry"
        subtitle={editing?.piece_title ?? undefined}
        initialMood={editingParsed?.mood ?? null}
        initialNote={editingParsed?.note ?? null}
        submitLabel="Save"
        cancelLabel="Cancel"
        onSubmit={onEditSubmit}
        onSkip={() => setEditing(null)}
        onDelete={onEditDelete}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radii.xl,
    borderWidth: Borders.thin,
  },
  content: { padding: Spacing.lg, paddingBottom: Spacing['2xl'], gap: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'] },
  header: {
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  dayBlock: {
    borderWidth: Borders.thin,
    borderRadius: Radii.xl,
    overflow: 'hidden',
  },
  dayHeaderBar: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayHeaderText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: Type.weight.heavy,
    letterSpacing: 0.3,
  },
  folderSection: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  folderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  folderBar: {
    width: Spacing.xs,
    height: 18,
    borderRadius: 2,
  },
  folderLabel: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  card: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: 10,
    gap: 6,
  },
  passageName: { fontWeight: Type.weight.bold, fontSize: Type.size.sm },
  folderSubtitle: { fontSize: Type.size.xs, fontWeight: Type.weight.semibold, marginTop: -2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pillRowWide: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radii.sm, maxWidth: '100%' },
  pillText: { color: '#fff', fontSize: Type.size.xs, fontWeight: Type.weight.bold },
  notesList: { gap: 2, marginTop: Spacing.xs },
  noteText: { fontSize: Type.size.xs, fontStyle: 'italic' },
  folderDayBlock: {
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: Type.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  passageStack: { gap: 6, marginLeft: Spacing.xs },
  passageRow: {
    gap: Spacing.xs,
    borderLeftWidth: Borders.thick,
    paddingLeft: 10,
    paddingVertical: Spacing.xs,
  },
});
