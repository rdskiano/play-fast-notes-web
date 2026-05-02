import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Overlays, Radii, Spacing, Status, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  enharmonicSpellings,
  pitchName,
  type Accidental,
  type Pitch,
} from '@/lib/music/pitch';

const ACCIDENTAL_SYMBOL: Record<Accidental, string> = {
  natural: '♮',
  sharp: '♯',
  flat: '♭',
  doubleSharp: '𝄪',
  doubleFlat: '𝄫',
};

type Props = {
  visible: boolean;
  pitch: Pitch | null;
  onChange: (pitch: Pitch) => void;
  onDelete: () => void;
  onClose: () => void;
  onInsertBefore?: () => void;
  onInsertAfter?: () => void;
};

export function NoteCardEditor({
  visible,
  pitch,
  onChange,
  onDelete,
  onClose,
  onInsertBefore,
  onInsertAfter,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  if (!pitch) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: C.background }]} />
        </View>
      </Modal>
    );
  }

  const spellings = enharmonicSpellings(pitch.midi);
  const currentSymbol = ACCIDENTAL_SYMBOL[pitch.accidental];
  const showCourtesy = pitch.courtesy === true;

  function pickSpelling(accidental: Accidental) {
    if (!pitch) return;
    onChange({ ...pitch, accidental });
    onClose();
  }

  function setCourtesy(next: boolean) {
    if (!pitch) return;
    onChange({ ...pitch, courtesy: next });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Edit note
          </ThemedText>
          <ThemedText style={styles.bigName}>{pitchName(pitch)}</ThemedText>

          <ThemedText style={styles.label}>Enharmonic respelling</ThemedText>
          <View style={styles.row}>
            {spellings.map((s) => {
              const selected = s.accidental === pitch.accidental;
              return (
                <Pressable
                  key={`${s.letter}-${s.accidental}`}
                  onPress={() => pickSpelling(s.accidental)}
                  style={[
                    styles.chip,
                    {
                      borderColor: C.icon,
                      backgroundColor: selected ? C.tint : 'transparent',
                    },
                  ]}>
                  <ThemedText
                    style={{
                      color: selected ? '#fff' : C.text,
                      fontSize: 22,
                      fontWeight: '800',
                    }}>
                    {s.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <ThemedText style={styles.label}>Courtesy accidental</ThemedText>
          <View style={styles.row}>
            <Pressable
              onPress={() => setCourtesy(false)}
              style={[
                styles.courtesyChip,
                {
                  borderColor: C.icon,
                  backgroundColor: !showCourtesy ? C.tint : 'transparent',
                },
              ]}>
              <ThemedText
                style={{
                  color: !showCourtesy ? '#fff' : C.text,
                  fontWeight: '800',
                  fontSize: 14,
                }}>
                Auto
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setCourtesy(true)}
              style={[
                styles.courtesyChip,
                {
                  borderColor: C.icon,
                  backgroundColor: showCourtesy ? C.tint : 'transparent',
                },
              ]}>
              <ThemedText
                style={{
                  color: showCourtesy ? '#fff' : C.text,
                  fontWeight: '800',
                  fontSize: 14,
                }}>
                Show {currentSymbol || '♮'}
              </ThemedText>
            </Pressable>
          </View>

          {(onInsertBefore || onInsertAfter) && (
            <>
              <ThemedText style={styles.label}>Insert a new note</ThemedText>
              <View style={styles.row}>
                {onInsertBefore && (
                  <Pressable
                    onPress={onInsertBefore}
                    style={[styles.insertBtn, { borderColor: C.tint }]}>
                    <ThemedText style={[styles.insertBtnText, { color: C.tint }]}>
                      ↤ Before
                    </ThemedText>
                  </Pressable>
                )}
                {onInsertAfter && (
                  <Pressable
                    onPress={onInsertAfter}
                    style={[styles.insertBtn, { borderColor: C.tint }]}>
                    <ThemedText style={[styles.insertBtnText, { color: C.tint }]}>
                      After ↦
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </>
          )}

          <View style={styles.bottomRow}>
            <Pressable onPress={onDelete} style={[styles.deleteBtn]}>
              <ThemedText style={styles.deleteText}>Delete</ThemedText>
            </Pressable>
            <Pressable onPress={onClose} style={[styles.doneBtn, { backgroundColor: C.tint }]}>
              <ThemedText style={styles.doneText}>Done</ThemedText>
            </Pressable>
          </View>
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
    maxWidth: 460,
    borderRadius: Radii['2xl'],
    padding: 22,
    paddingTop: 28,
    gap: 14,
  },
  bigName: { fontSize: 52, fontWeight: Type.weight.heavy, textAlign: 'center', lineHeight: 60 },
  label: { opacity: Opacity.subtle, fontSize: 12, fontWeight: Type.weight.semibold, marginTop: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', flexWrap: 'wrap' },
  chip: {
    borderWidth: Borders.thick,
    borderRadius: Radii.lg,
    minWidth: 72,
    height: 56,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courtesyChip: {
    borderWidth: Borders.thick,
    borderRadius: Radii.lg,
    paddingHorizontal: 18,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insertBtn: {
    borderWidth: Borders.thick,
    borderRadius: Radii.lg,
    paddingHorizontal: 18,
    paddingVertical: Spacing.md,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insertBtnText: { fontWeight: Type.weight.heavy, fontSize: 15 },
  bottomRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    justifyContent: 'space-between',
  },
  deleteBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    backgroundColor: Status.danger,
  },
  deleteText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 15 },
  doneBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
  doneText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 15 },
});
