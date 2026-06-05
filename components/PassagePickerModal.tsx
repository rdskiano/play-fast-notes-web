import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listAllDocuments, type DocumentRow } from '@/lib/db/repos/documents';
import { listAllFolders, type Folder } from '@/lib/db/repos/folders';
import { listPassages, type Passage } from '@/lib/db/repos/passages';

// Pull a "p. N" hint from a passage's regions (the source pages it was
// cropped from). Pages are stored 0-based, so we add 1 for display. Returns
// undefined when there's nothing decodable — the row just omits the hint.
function extractPageHint(p: Passage): string | undefined {
  if (!p.regions_json) return undefined;
  try {
    const regions =
      typeof p.regions_json === 'string'
        ? JSON.parse(p.regions_json)
        : p.regions_json;
    if (Array.isArray(regions) && regions.length > 0) {
      const pages = regions
        .map((r: any) => Number(r.page))
        .filter(Number.isFinite);
      if (pages.length === 0) return undefined;
      const minPage = Math.min(...pages);
      return Number.isFinite(minPage) ? `p. ${minPage + 1}` : undefined;
    }
  } catch {
    // ignore — fall through to no hint
  }
  return undefined;
}

type PickerSection = {
  title: string;
  subtitle?: string;
  items: { passage: Passage; pageHint?: string }[];
};

type Props = {
  visible: boolean;
  selectedId: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
  title?: string;
};

export function PassagePickerModal({
  visible,
  selectedId,
  onClose,
  onPick,
  title = 'Pick a passage',
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [passages, setPassages] = useState<Passage[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const [p, f, d] = await Promise.all([
        listPassages(),
        listAllFolders(),
        listAllDocuments(),
      ]);
      setPassages(p);
      setFolders(f);
      setDocuments(d);
    })();
  }, [visible]);

  // Group by parent document first (the primary workflow — a PDF full of
  // cropped passages with near-identical auto-titles), then by folder, then a
  // final "Loose passages" catch-all. Documents come first because that's
  // where the disambiguation matters most.
  const sections = useMemo(() => {
    const byDocument = new Map<string, Passage[]>();
    const byFolder = new Map<string, Passage[]>();
    const loose: Passage[] = [];
    for (const p of passages) {
      if (p.document_id) {
        if (!byDocument.has(p.document_id)) byDocument.set(p.document_id, []);
        byDocument.get(p.document_id)!.push(p);
      } else if (p.folder_id) {
        if (!byFolder.has(p.folder_id)) byFolder.set(p.folder_id, []);
        byFolder.get(p.folder_id)!.push(p);
      } else {
        loose.push(p);
      }
    }
    const out: PickerSection[] = [];
    for (const d of documents) {
      const list = byDocument.get(d.id);
      if (!list || list.length === 0) continue;
      out.push({
        title: d.title,
        subtitle: list.length === 1 ? '1 passage' : `${list.length} passages`,
        items: list.map((p) => ({ passage: p, pageHint: extractPageHint(p) })),
      });
    }
    for (const f of folders) {
      const list = byFolder.get(f.id);
      if (!list || list.length === 0) continue;
      out.push({ title: f.name, items: list.map((p) => ({ passage: p })) });
    }
    if (loose.length > 0) {
      out.push({
        title: 'Loose passages',
        items: loose.map((p) => ({ passage: p })),
      });
    }
    return out;
  }, [passages, folders, documents]);

  // Collapsed by default — the user sees a tidy list of piece/folder titles and
  // expands the one they want. The section holding the current selection starts
  // open so it's visible.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!visible) return;
    const idx = sections.findIndex((s) =>
      s.items.some((it) => it.passage.id === selectedId),
    );
    setExpanded(idx >= 0 ? new Set([idx]) : new Set());
  }, [visible, sections, selectedId]);

  function toggleSection(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <View
          style={[
            styles.topBar,
            // Push the bar below the status bar / notch — this is a full-screen
            // Modal, so without the inset the Cancel button lands under the
            // notch on a phone and can't be tapped.
            { paddingTop: insets.top + 14, borderBottomColor: C.icon + '44' },
          ]}>
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
          <ThemedText style={styles.topCenter} numberOfLines={1}>
            {title}
          </ThemedText>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {sections.length === 0 ? (
            <ThemedText style={{ opacity: 0.6, textAlign: 'center' }}>
              No passages yet.
            </ThemedText>
          ) : (
            sections.map((s, i) => {
              const isOpen = expanded.has(i);
              return (
              <View key={i} style={{ gap: 6 }}>
                <Pressable
                  onPress={() => toggleSection(i)}
                  style={styles.sectionHeader}>
                  <ThemedText style={[styles.chevron, { color: C.icon }]}>
                    {isOpen ? '▾' : '▸'}
                  </ThemedText>
                  <ThemedText style={styles.folderHeader} numberOfLines={1}>
                    {s.title}
                  </ThemedText>
                  <ThemedText style={[styles.folderCount, { color: C.icon }]}>
                    {s.items.length}
                  </ThemedText>
                </Pressable>
                {isOpen &&
                  s.items.map(({ passage: p, pageHint }) => {
                  const selected = p.id === selectedId;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => onPick(p.id)}
                      style={[
                        styles.row,
                        {
                          borderColor: selected ? C.tint : C.icon + '55',
                          backgroundColor: selected ? C.tint + '22' : 'transparent',
                        },
                      ]}>
                      <View
                        style={[
                          styles.radio,
                          {
                            borderColor: selected ? C.tint : C.icon,
                            backgroundColor: selected ? C.tint : 'transparent',
                          },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleRow}>
                          <ThemedText style={styles.title} numberOfLines={1}>
                            {p.title}
                          </ThemedText>
                          {pageHint ? (
                            <ThemedText
                              style={[styles.pageHint, { color: C.icon }]}>
                              {pageHint}
                            </ThemedText>
                          ) : null}
                        </View>
                        {p.composer && (
                          <ThemedText
                            style={[styles.composer, { color: C.icon }]}
                            numberOfLines={1}>
                            {p.composer}
                          </ThemedText>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              );
            })
          )}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    // paddingTop is applied inline as insets.top + 14 (safe-area aware).
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  chevron: { fontSize: Type.size.md, width: 16, textAlign: 'center' },
  folderCount: { fontSize: 13, fontWeight: Type.weight.semibold },
  folderHeader: { flex: 1, fontWeight: Type.weight.heavy, fontSize: Type.size.md },
  folderSubtitle: { fontSize: 12, marginTop: -2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  pageHint: { fontSize: 12, fontWeight: Type.weight.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: Borders.thick },
  title: { fontWeight: Type.weight.bold, fontSize: Type.size.md },
  composer: { fontSize: 12 },
});
