import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ConfirmModal } from '@/components/ConfirmModal';
import { PracticeLogNotePrompt } from '@/components/PracticeLogNotePrompt';
import { RecordingPlayer } from '@/components/RecordingPlayer';
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
  add_a_note: 'Add a Note',
  pitch: 'Pitch',
  phrasing: 'Phrasing',
  recording: 'Recording',
  freeform: 'Freeform',
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
    if (entry.strategy === 'recording' && typeof data.duration_seconds === 'number') {
      const m = Math.floor(data.duration_seconds / 60);
      const s = Math.floor(data.duration_seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
  } catch {
    // ignore
  }
  return null;
}

function recordingUri(entry: LibraryPracticeLogEntry): string | null {
  if (!entry.data_json) return null;
  try {
    const data = JSON.parse(entry.data_json);
    return typeof data.recording_uri === 'string' ? data.recording_uri : null;
  } catch {
    return null;
  }
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

// Builds the display label for a practice-log row. Standalone passages show
// just their title; document-derived passages prepend the document title and
// section name (when known): "Mahler 9 - IV. Adagio - bars 281-291".
// Used in by-date view (where document/section are not used as headers).
function passageLabel(e: LibraryPracticeLogEntry): string {
  const title = e.piece_title || 'Untitled';
  const parts: string[] = [];
  if (e.document_title) parts.push(e.document_title);
  if (e.section_name) parts.push(e.section_name);
  parts.push(title);
  return parts.join(' · ');
}

type DayFolderGroup = {
  folderId: string | null;
  folderName: string;
  passages: PassageGroup[];
};

type DayGroup = { dateLabel: string; folders: DayFolderGroup[] };

// In by-folder view, passages within a day are split into documents (each
// holding its own section sub-groups) and standalone passages, so users see
// "Folder → Mahler 9 → IV. Adagio → bars 281-291" instead of a flat list.
type SectionSubGroup = {
  sectionName: string | null;
  passages: PassageGroup[];
};

type DocumentSubGroup = {
  documentId: string;
  documentTitle: string;
  sectionGroups: SectionSubGroup[];
};

type FolderDayGroup = {
  dateLabel: string;
  documentGroups: DocumentSubGroup[];
  standalonePassages: PassageGroup[];
};

type FolderGroup = {
  folderId: string | null;
  folderName: string;
  dayGroups: FolderDayGroup[];
};

function renderPassageRow(
  pg: PassageGroup,
  key: number,
  C: typeof Colors.light,
  STRATEGY_COLORS: Record<string, string>,
  setEditing: (e: LibraryPracticeLogEntry) => void,
) {
  return (
    <View
      key={key}
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
              { backgroundColor: STRATEGY_COLORS[e.strategy] ?? C.icon },
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
      {pg.entries.map((e) => {
        const uri = recordingUri(e);
        if (!uri) return null;
        return <RecordingPlayer key={`rec-${e.id}`} uri={uri} />;
      })}
    </View>
  );
}

export default function LibraryLogScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { colors: STRATEGY_COLORS } = useStrategyColors();

  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [entries, setEntries] = useState<LibraryPracticeLogEntry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [editing, setEditing] = useState<LibraryPracticeLogEntry | null>(null);
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<LibraryPracticeLogEntry | null>(null);

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
    // Stage the target and let ConfirmModal take it from here. iPad Safari
    // suppresses window.confirm in modal contexts, so the in-app modal is
    // the only reliable confirmation surface.
    setDeleteConfirmFor(editing);
    setEditing(null);
  }

  async function performDelete() {
    if (!deleteConfirmFor) return;
    await deletePracticeLog(deleteConfirmFor.id);
    setDeleteConfirmFor(null);
    refresh();
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
          passageTitle: passageLabel(e),
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

  // ── By-folder grouping: folder → day → (documents → sections) + standalone ─
  // Within a day, document-derived passages cluster under their document title
  // and section name; standalone passages list after, just by passage title.
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

      // day → ( documents (insertion-ordered) → sections (insertion-ordered) → passages,
      //         standalone passages (insertion-ordered) )
      type DayBuilder = {
        dateLabel: string;
        docMap: Map<
          string,
          {
            documentTitle: string;
            sectionMap: Map<string, SectionSubGroup>;
          }
        >;
        standaloneMap: Map<string, PassageGroup>;
      };
      const dayMap = new Map<string, DayBuilder>();

      for (const e of list) {
        const dk = dateKey(e.practiced_at);
        if (!dayMap.has(dk)) {
          dayMap.set(dk, {
            dateLabel: formatDate(e.practiced_at),
            docMap: new Map(),
            standaloneMap: new Map(),
          });
        }
        const day = dayMap.get(dk)!;

        if (e.document_id && e.document_title) {
          if (!day.docMap.has(e.document_id)) {
            day.docMap.set(e.document_id, {
              documentTitle: e.document_title,
              sectionMap: new Map(),
            });
          }
          const doc = day.docMap.get(e.document_id)!;
          // Use a string key so passages with no section land in one bucket.
          const sectionKey = e.section_name ?? '__nosection__';
          if (!doc.sectionMap.has(sectionKey)) {
            doc.sectionMap.set(sectionKey, {
              sectionName: e.section_name,
              passages: [],
            });
          }
          const section = doc.sectionMap.get(sectionKey)!;
          let pg = section.passages.find((p) => p.entries[0]?.piece_id === e.piece_id);
          if (!pg) {
            pg = {
              passageTitle: e.piece_title || 'Untitled',
              folderName: e.folder_name,
              entries: [],
            };
            section.passages.push(pg);
          }
          pg.entries.push(e);
        } else {
          if (!day.standaloneMap.has(e.piece_id)) {
            day.standaloneMap.set(e.piece_id, {
              passageTitle: e.piece_title || 'Untitled',
              folderName: e.folder_name,
              entries: [],
            });
          }
          day.standaloneMap.get(e.piece_id)!.entries.push(e);
        }
      }

      folderGroups.push({
        folderId: key,
        folderName,
        dayGroups: Array.from(dayMap.values()).map((d) => ({
          dateLabel: d.dateLabel,
          documentGroups: Array.from(d.docMap.entries()).map(([docId, doc]) => ({
            documentId: docId,
            documentTitle: doc.documentTitle,
            sectionGroups: Array.from(doc.sectionMap.values()),
          })),
          standalonePassages: Array.from(d.standaloneMap.values()),
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
                            {pg.entries.map((e) => {
                              const uri = recordingUri(e);
                              if (!uri) return null;
                              return <RecordingPlayer key={`rec-${e.id}`} uri={uri} />;
                            })}
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

                      {dg.documentGroups.map((doc) => (
                        <View key={doc.documentId} style={styles.documentGroup}>
                          <ThemedText
                            style={[styles.documentTitle, { color: C.text }]}
                            numberOfLines={1}>
                            {doc.documentTitle}
                          </ThemedText>
                          {doc.sectionGroups.map((sg, si) => (
                            <View key={si} style={styles.sectionGroup}>
                              {sg.sectionName && (
                                <ThemedText
                                  style={[styles.sectionName, { color: C.icon }]}
                                  numberOfLines={1}>
                                  {sg.sectionName}
                                </ThemedText>
                              )}
                              <View style={styles.passageStack}>
                                {sg.passages.map((pg, k) =>
                                  renderPassageRow(pg, k, C, STRATEGY_COLORS, setEditing),
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      ))}

                      {dg.standalonePassages.length > 0 && (
                        <View style={styles.passageStack}>
                          {dg.standalonePassages.map((pg, k) =>
                            renderPassageRow(pg, k, C, STRATEGY_COLORS, setEditing),
                          )}
                        </View>
                      )}
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

      <ConfirmModal
        visible={deleteConfirmFor !== null}
        title="Delete this log entry?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={performDelete}
        onCancel={() => setDeleteConfirmFor(null)}
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
  documentGroup: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  documentTitle: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    marginLeft: Spacing.xs,
  },
  sectionGroup: {
    gap: Spacing.xs,
    marginLeft: Spacing.md,
  },
  sectionName: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.bold,
    marginLeft: Spacing.xs,
    letterSpacing: 0.5,
  },
});
