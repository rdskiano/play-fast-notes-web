// Browse the library — folders, PDFs, loose passages — to pick passages for a
// Serial Practice session. Opening a PDF shows its pages with the passage
// boxes drawn on them, so passages are chosen by looking at the actual score
// instead of guessing from a name. Drill-in navigation is internal; the
// selected ids are owned by the parent screen.

import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getDocument,
  listAllDocuments,
  listDocumentsInFolder,
  parsePages,
  type DocumentPage,
  type DocumentRow,
} from '@/lib/db/repos/documents';
import {
  listAllFolders,
  listFoldersInParent,
  type Folder,
} from '@/lib/db/repos/folders';
import {
  listPassagesInDocument,
  listPassagesInFolder,
  parseRegions,
  type Passage,
} from '@/lib/db/repos/passages';

// A location in the drill-in stack: the library root, a folder, or a PDF.
type Loc =
  | { kind: 'root' }
  | { kind: 'folder'; id: string; title: string }
  | { kind: 'document'; id: string; title: string };

// Cap the rendered page width so a PDF page isn't enormous on a wide iPad.
const MAX_PAGE_WIDTH = 760;

export function PassagePicker({
  selectedIds,
  passages,
  order,
  onToggle,
}: {
  /** Currently-selected passage ids, in selection order. */
  selectedIds: string[];
  /** Every passage in the library — drives the per-folder/PDF selected count. */
  passages: Passage[];
  /** 'serial' shows an order number on a selection; 'random' shows a check. */
  order: 'serial' | 'random';
  /** Toggle a passage in or out of the selection. */
  onToggle: (passageId: string) => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [stack, setStack] = useState<Loc[]>([{ kind: 'root' }]);
  const loc = stack[stack.length - 1];

  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loose, setLoose] = useState<Passage[]>([]);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [docPassages, setDocPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(0);

  // The whole folder/document tree — loaded once, used only to tally how many
  // selected passages live inside each folder and PDF (the count badges).
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [allDocs, setAllDocs] = useState<DocumentRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllFolders(), listAllDocuments()]).then(([fs, ds]) => {
      if (cancelled) return;
      setAllFolders(fs);
      setAllDocs(ds);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // How many selected passages sit inside each folder (recursively) and each
  // PDF. A passage's home folder is its PDF's folder, or its own folder.
  const { folderCounts, docCounts } = useMemo(() => {
    const selected = new Set(selectedIds);
    const docFolder = new Map<string, string | null>();
    for (const d of allDocs) docFolder.set(d.id, d.folder_id);
    const parentOf = new Map<string, string | null>();
    for (const f of allFolders) parentOf.set(f.id, f.parent_folder_id);

    const fCounts = new Map<string, number>();
    const dCounts = new Map<string, number>();
    for (const p of passages) {
      if (!selected.has(p.id)) continue;
      if (p.document_id) {
        dCounts.set(p.document_id, (dCounts.get(p.document_id) ?? 0) + 1);
      }
      const home = p.document_id
        ? docFolder.get(p.document_id) ?? null
        : p.folder_id;
      const seen = new Set<string>();
      let f = home;
      while (f && !seen.has(f)) {
        seen.add(f);
        fCounts.set(f, (fCounts.get(f) ?? 0) + 1);
        f = parentOf.get(f) ?? null;
      }
    }
    return { folderCounts: fCounts, docCounts: dCounts };
  }, [selectedIds, passages, allFolders, allDocs]);

  // Re-fetch whenever the drill-in location changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (loc.kind === 'document') {
          const [doc, ps] = await Promise.all([
            getDocument(loc.id),
            listPassagesInDocument(loc.id),
          ]);
          if (cancelled) return;
          setPages(doc ? parsePages(doc.pages_json) : []);
          setDocPassages(ps);
        } else {
          const folderId = loc.kind === 'folder' ? loc.id : null;
          const [fs, ds, ps] = await Promise.all([
            listFoldersInParent(folderId),
            listDocumentsInFolder(folderId),
            listPassagesInFolder(folderId),
          ]);
          if (cancelled) return;
          setFolders(fs);
          setDocs(ds);
          // Document-backed passages belong under their PDF, not loose here.
          setLoose(ps.filter((p) => !p.document_id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loc]);

  const goBack = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const openFolder = (f: Folder) =>
    setStack((s) => [...s, { kind: 'folder', id: f.id, title: f.name }]);
  const openDocument = (d: DocumentRow) =>
    setStack((s) => [...s, { kind: 'document', id: d.id, title: d.title }]);

  const title = loc.kind === 'root' ? 'Library' : loc.title;
  const pageWidth = Math.min(width - Spacing.md * 2, MAX_PAGE_WIDTH);

  function renderPassageRow(p: Passage) {
    const idx = selectedIds.indexOf(p.id);
    const selected = idx >= 0;
    return (
      <Pressable
        key={p.id}
        onPress={() => onToggle(p.id)}
        style={[
          styles.passageRow,
          {
            borderColor: selected ? C.tint : C.icon + '44',
            backgroundColor: selected ? C.tint + '11' : 'transparent',
          },
        ]}>
        {p.thumbnail_uri ? (
          <Image
            source={{ uri: p.thumbnail_uri }}
            style={styles.thumb}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumb, { backgroundColor: C.icon + '22' }]} />
        )}
        <ThemedText style={styles.passageTitle} numberOfLines={1}>
          {p.title || 'Untitled'}
        </ThemedText>
        <View
          style={[
            styles.indicator,
            {
              borderColor: selected ? C.tint : C.icon,
              backgroundColor: selected ? C.tint : 'transparent',
            },
          ]}>
          {selected && (
            <ThemedText style={styles.indicatorText}>
              {order === 'serial' ? String(idx + 1) : '✓'}
            </ThemedText>
          )}
        </View>
      </Pressable>
    );
  }

  function renderPage(page: DocumentPage) {
    if (pageWidth <= 0 || page.w <= 0 || page.h <= 0) return null;
    const W = pageWidth;
    const H = (W * page.h) / page.w;
    const hits: { passage: Passage; x: number; y: number; w: number; h: number }[] =
      [];
    for (const p of docPassages) {
      for (const r of parseRegions(p.regions_json)) {
        if (r.page === page.index) {
          hits.push({ passage: p, x: r.x, y: r.y, w: r.w, h: r.h });
        }
      }
    }
    // Largest first → small boxes render last (on top) and catch the tap.
    hits.sort((a, b) => b.w * b.h - a.w * a.h);
    return (
      <View key={page.index} style={[styles.page, { width: W, height: H }]}>
        <Image
          source={{ uri: page.image_uri }}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
        />
        {hits.map(({ passage, x, y, w, h }) => {
          const idx = selectedIds.indexOf(passage.id);
          const selected = idx >= 0;
          return (
            <Pressable
              key={`${passage.id}:${page.index}`}
              onPress={() => onToggle(passage.id)}
              style={[
                styles.box,
                {
                  left: (x / page.w) * W,
                  top: (y / page.h) * H,
                  width: (w / page.w) * W,
                  height: (h / page.h) * H,
                  borderColor: selected ? C.tint : '#000',
                  borderWidth: selected ? 3 : 1.5,
                  backgroundColor: selected ? C.tint + '33' : '#00000014',
                },
              ]}>
              <View style={styles.boxLabel}>
                <ThemedText
                  style={[
                    styles.boxLabelText,
                    { color: selected ? C.tint : '#222' },
                  ]}
                  numberOfLines={1}>
                  {passage.title}
                </ThemedText>
              </View>
              {selected && (
                <View style={[styles.boxBadge, { backgroundColor: C.tint }]}>
                  <ThemedText style={styles.boxBadgeText}>
                    {order === 'serial' ? String(idx + 1) : '✓'}
                  </ThemedText>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      style={styles.fill}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.navRow, { borderBottomColor: C.icon + '33' }]}>
        {stack.length > 1 ? (
          <Pressable onPress={goBack} hitSlop={10} style={styles.navBtn}>
            <ThemedText
              style={[styles.navBtnText, { color: C.tint }]}
              numberOfLines={1}>
              {loc.kind === 'document' ? '‹ Choose more passages' : '‹ Back'}
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
        <ThemedText style={styles.navTitle} numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText style={[styles.navCount, { color: C.icon }]}>
          {selectedIds.length} selected
        </ThemedText>
      </View>

      <ThemedText style={[styles.hint, { color: C.icon }]}>
        {loc.kind === 'document'
          ? 'Tap a passage box to add or remove it.'
          : 'Open a folder or PDF, then tap passage boxes on the music to pick them.'}
      </ThemedText>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.tint} />
        </View>
      ) : loc.kind === 'document' ? (
        <ScrollView contentContainerStyle={styles.pageList}>
          {pages.length === 0 ? (
            <ThemedText style={[styles.empty, { color: C.icon }]}>
              This PDF has no pages.
            </ThemedText>
          ) : (
            pages.map((page) => renderPage(page))
          )}
          {pages.length > 0 && docPassages.length === 0 && (
            <ThemedText style={[styles.empty, { color: C.icon }]}>
              No passages have been marked in this PDF yet.
            </ThemedText>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {folders.length === 0 && docs.length === 0 && loose.length === 0 && (
            <ThemedText style={[styles.empty, { color: C.icon }]}>
              Nothing here yet.
            </ThemedText>
          )}
          {folders.map((f) => {
            const n = folderCounts.get(f.id) ?? 0;
            return (
              <Pressable
                key={f.id}
                onPress={() => openFolder(f)}
                style={[styles.row, { borderColor: C.icon + '44' }]}>
                <ThemedText style={styles.rowIcon}>📁</ThemedText>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>
                  {f.name}
                </ThemedText>
                {n > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: C.tint }]}>
                    <ThemedText style={styles.countBadgeText}>{n}</ThemedText>
                  </View>
                )}
                <ThemedText style={[styles.chevron, { color: C.icon }]}>›</ThemedText>
              </Pressable>
            );
          })}
          {docs.map((d) => {
            const n = docCounts.get(d.id) ?? 0;
            return (
              <Pressable
                key={d.id}
                onPress={() => openDocument(d)}
                style={[styles.row, { borderColor: C.icon + '44' }]}>
                <ThemedText style={styles.rowIcon}>📄</ThemedText>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>
                  {d.title}
                </ThemedText>
                {n > 0 && (
                  <View style={[styles.countBadge, { backgroundColor: C.tint }]}>
                    <ThemedText style={styles.countBadgeText}>{n}</ThemedText>
                  </View>
                )}
                <ThemedText style={[styles.chevron, { color: C.icon }]}>›</ThemedText>
              </Pressable>
            );
          })}
          {loose.map((p) => renderPassageRow(p))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  navBtn: { minWidth: 64 },
  navBtnText: { fontSize: Type.size.md, fontWeight: Type.weight.bold },
  navTitle: { flex: 1, fontSize: Type.size.md, fontWeight: Type.weight.bold },
  navCount: { fontSize: Type.size.sm, fontWeight: Type.weight.semibold },
  hint: {
    fontSize: Type.size.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
  },
  rowIcon: { fontSize: 20 },
  rowTitle: {
    flex: 1,
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
  },
  chevron: { fontSize: 22, fontWeight: Type.weight.heavy },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
  },
  passageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
  },
  thumb: { width: 56, height: 38, borderRadius: Radii.sm },
  passageTitle: {
    flex: 1,
    fontSize: Type.size.md,
    fontWeight: Type.weight.semibold,
  },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
  pageList: { padding: Spacing.md, gap: Spacing.md, alignItems: 'center' },
  page: {
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: Radii.sm,
    overflow: 'hidden',
  },
  box: { position: 'absolute', borderRadius: Radii.sm },
  boxLabel: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: '#ffffffe0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.sm,
    maxWidth: '92%',
  },
  boxLabelText: { fontSize: Type.size.xs, fontWeight: Type.weight.semibold },
  boxBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  boxBadgeText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.xs,
  },
  empty: {
    textAlign: 'center',
    padding: Spacing.xl,
    fontSize: Type.size.sm,
  },
});
