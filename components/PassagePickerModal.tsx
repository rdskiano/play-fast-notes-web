import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listAllFolders, type Folder } from '@/lib/db/repos/folders';
import { listPassages, type Passage } from '@/lib/db/repos/passages';

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
  const [passages, setPassages] = useState<Passage[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const [p, f] = await Promise.all([listPassages(), listAllFolders()]);
      setPassages(p);
      setFolders(f);
    })();
  }, [visible]);

  const sections = useMemo(() => {
    const byFolder = new Map<string | null, Passage[]>();
    for (const p of passages) {
      const key = p.folder_id ?? null;
      if (!byFolder.has(key)) byFolder.set(key, []);
      byFolder.get(key)!.push(p);
    }
    const out: { title: string; items: Passage[] }[] = [];
    for (const f of folders) {
      const list = byFolder.get(f.id);
      if (!list || list.length === 0) continue;
      out.push({ title: f.name, items: list });
    }
    const unfiled = byFolder.get(null);
    if (unfiled && unfiled.length > 0) {
      out.push({ title: 'Unfiled', items: unfiled });
    }
    return out;
  }, [passages, folders]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <View style={[styles.topBar, { borderBottomColor: C.icon + '44' }]}>
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
            sections.map((s, i) => (
              <View key={i} style={{ gap: 6 }}>
                <ThemedText style={styles.folderHeader}>{s.title}</ThemedText>
                {s.items.map((p) => {
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
                        <ThemedText style={styles.title} numberOfLines={1}>
                          {p.title}
                        </ThemedText>
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
            ))
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
    paddingTop: 14,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topCenter: { fontWeight: Type.weight.bold, fontSize: Type.size.md, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
  folderHeader: { fontWeight: Type.weight.heavy, fontSize: Type.size.md, marginTop: Spacing.xs },
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
