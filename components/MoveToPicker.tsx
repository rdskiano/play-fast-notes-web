import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Overlays, Spacing } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Folder } from '@/lib/db/repos/folders';

type Option = { id: string | null; label: string; depth: number; disabled?: boolean };

type Props = {
  visible: boolean;
  title: string;
  folders: Folder[];
  disabledIds?: Set<string>;
  onPick: (folderId: string | null) => void;
  onCancel: () => void;
};

function buildOptions(folders: Folder[], disabledIds?: Set<string>): Option[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parent_folder_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f);
  }
  const out: Option[] = [{ id: null, label: '📁 Library root', depth: 0 }];
  function walk(parent: string | null, depth: number) {
    const children = byParent.get(parent) ?? [];
    for (const f of children) {
      out.push({
        id: f.id,
        label: `${'  '.repeat(depth)}📁 ${f.name}`,
        depth,
        disabled: disabledIds?.has(f.id),
      });
      walk(f.id, depth + 1);
    }
  }
  walk(null, 1);
  return out;
}

export function MoveToPicker({ visible, title, folders, disabledIds, onPick, onCancel }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const options = buildOptions(folders, disabledIds);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText type="subtitle">{title}</ThemedText>
          <ScrollView style={{ maxHeight: 320 }}>
            {options.map((o) => (
              <Pressable
                key={o.id ?? 'root'}
                disabled={o.disabled}
                onPress={() => onPick(o.id)}
                style={[
                  styles.row,
                  { borderColor: C.icon + '55', opacity: o.disabled ? 0.35 : 1 },
                ]}>
                <ThemedText>{o.label}</ThemedText>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancel} onPress={onCancel}>
            <ThemedText style={{ color: C.tint, fontWeight: '700' }}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    gap: Spacing.md,
  },
  row: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { alignItems: 'center', paddingVertical: 10 },
});
