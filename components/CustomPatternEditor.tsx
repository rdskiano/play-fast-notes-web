// Modal sheet for building / editing a Custom Tempo Ladder pattern. Lives
// per-user in Supabase, so a saved pattern follows the user across every
// passage and device. Save is enabled once the name is non-empty and the
// block list has at least one row; tempo references above Performance are
// allowed (intentional overshoot training per user spec).
//
// Visual preview at the bottom uses the same CustomPatternDots component
// that drives the practice screen, so what you see in the editor is exactly
// what you'll see while playing.

import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { CustomPatternDots } from '@/components/CustomPatternDots';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  MAX_BLOCKS_PER_PATTERN,
  MAX_REPS_PER_BLOCK,
  MIN_REPS_PER_BLOCK,
  PRESET_DELTAS,
  formatTempoRef,
  summarizePattern,
  totalRepsInPattern,
  validatePattern,
  type CustomBlock,
  type CustomPattern,
  type TempoRef,
} from '@/lib/strategies/customPatterns';

type Props = {
  visible: boolean;
  /** When editing an existing pattern, pre-fill from this. */
  initial?: CustomPattern | null;
  /** Sample Base/Performance for the live preview. */
  previewBase: number;
  previewPerformance: number;
  onCancel: () => void;
  onSave: (name: string, blocks: CustomBlock[]) => Promise<void> | void;
};

const DEFAULT_BLOCKS: CustomBlock[] = [
  { count: 9, tempo: { kind: 'base' } },
  { count: 1, tempo: { kind: 'base_plus', delta: 10 } },
];

export function CustomPatternEditor({
  visible,
  initial,
  previewBase,
  previewPerformance,
  onCancel,
  onSave,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<CustomBlock[]>(DEFAULT_BLOCKS);
  const [saving, setSaving] = useState(false);
  const [tempoSheetIndex, setTempoSheetIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the modal re-opens for a new edit / new-build session.
  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? '');
    setBlocks(initial?.blocks ?? DEFAULT_BLOCKS);
    setSaving(false);
    setTempoSheetIndex(null);
    setError(null);
  }, [visible, initial]);

  const validation = useMemo(() => validatePattern({ name, blocks }), [name, blocks]);
  const canSave = validation === null && !saving;

  function updateBlock(i: number, patch: Partial<CustomBlock>) {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addBlock() {
    if (blocks.length >= MAX_BLOCKS_PER_PATTERN) return;
    setBlocks((prev) => [...prev, { count: 1, tempo: { kind: 'base' } }]);
  }
  function bumpCount(i: number, delta: number) {
    const next = Math.max(
      MIN_REPS_PER_BLOCK,
      Math.min(MAX_REPS_PER_BLOCK, blocks[i].count + delta),
    );
    updateBlock(i, { count: next });
  }

  async function handleSave() {
    if (!canSave) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), blocks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the pattern.');
      setSaving(false);
    }
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: C.background, borderColor: C.icon + '33' }]}>
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled">
            <ThemedText style={[styles.title, { color: C.text }]}>
              {initial ? 'Edit pattern' : 'Build a custom pattern'}
            </ThemedText>
            <ThemedText style={[styles.helper, { color: C.icon }]}>
              Define a sequence of reps at different tempos. One clean run of the
              whole pattern bumps the metronome up by your Increment. A miss
              restarts at the first rep.
            </ThemedText>

            {/* Name */}
            <ThemedText style={[styles.fieldLabel, { color: C.icon }]}>Name</ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="My 9+1"
              placeholderTextColor={C.icon + '99'}
              style={[
                styles.nameInput,
                { borderColor: C.icon + '55', color: C.text },
              ]}
              maxLength={48}
            />

            {/* Blocks */}
            <View style={styles.blocksHeader}>
              <ThemedText style={[styles.fieldLabel, { color: C.icon }]}>Blocks</ThemedText>
              <ThemedText style={[styles.fieldHint, { color: C.icon }]}>
                {blocks.length} / {MAX_BLOCKS_PER_PATTERN}
              </ThemedText>
            </View>

            {blocks.map((b, i) => (
              <View
                key={i}
                style={[styles.blockRow, { borderColor: C.icon + '33' }]}>
                <ThemedText style={[styles.blockNum, { color: C.icon }]}>
                  {i + 1}
                </ThemedText>
                {/* Count stepper */}
                <View style={styles.counter}>
                  <Pressable
                    onPress={() => bumpCount(i, -1)}
                    hitSlop={8}
                    style={[styles.counterBtn, { borderColor: C.icon }]}>
                    <ThemedText style={[styles.counterGlyph, { color: C.text }]}>−</ThemedText>
                  </Pressable>
                  <ThemedText style={[styles.counterValue, { color: C.text }]}>
                    {b.count}
                  </ThemedText>
                  <Pressable
                    onPress={() => bumpCount(i, +1)}
                    hitSlop={8}
                    style={[styles.counterBtn, { borderColor: C.icon }]}>
                    <ThemedText style={[styles.counterGlyph, { color: C.text }]}>+</ThemedText>
                  </Pressable>
                </View>
                <ThemedText style={[styles.timesGlyph, { color: C.icon }]}>×</ThemedText>
                {/* Tempo dropdown trigger */}
                <Pressable
                  onPress={() => setTempoSheetIndex(i)}
                  style={[styles.tempoBtn, { borderColor: C.icon }]}>
                  <ThemedText style={[styles.tempoBtnText, { color: C.text }]}>
                    {formatTempoRef(b.tempo)}
                  </ThemedText>
                  <ThemedText style={[styles.tempoBtnCaret, { color: C.icon }]}>▾</ThemedText>
                </Pressable>
                {/* Delete */}
                <Pressable
                  onPress={() => removeBlock(i)}
                  hitSlop={6}
                  disabled={blocks.length === 1}
                  style={[
                    styles.deleteBtn,
                    { opacity: blocks.length === 1 ? 0.3 : 1 },
                  ]}>
                  <ThemedText style={[styles.deleteGlyph, { color: C.icon }]}>✕</ThemedText>
                </Pressable>
              </View>
            ))}

            {blocks.length < MAX_BLOCKS_PER_PATTERN && (
              <Pressable
                onPress={addBlock}
                style={[styles.addBtn, { borderColor: C.tint }]}>
                <ThemedText style={[styles.addBtnText, { color: C.tint }]}>
                  + Add block
                </ThemedText>
              </Pressable>
            )}

            {/* Preview */}
            <ThemedText style={[styles.fieldLabel, { color: C.icon, marginTop: Spacing.lg }]}>
              Preview ({totalRepsInPattern({ blocks })} reps per set)
            </ThemedText>
            <View style={[styles.previewBox, { borderColor: C.icon + '22' }]}>
              <CustomPatternDots
                pattern={{ blocks }}
                base={previewBase}
                performance={previewPerformance}
                size="small"
                accent={C.tint}
              />
              <ThemedText style={[styles.previewSummary, { color: C.icon }]}>
                {summarizePattern({ blocks })}
              </ThemedText>
            </View>

            {error && (
              <ThemedText style={[styles.errorText, { color: '#c0392b' }]}>
                {error}
              </ThemedText>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: C.icon + '22' }]}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.footerBtn,
                { backgroundColor: pressed ? C.icon + '11' : 'transparent' },
              ]}>
              <ThemedText style={[styles.footerBtnText, { color: C.icon }]}>
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.saveBtn,
                {
                  backgroundColor: canSave
                    ? pressed
                      ? C.tint + 'cc'
                      : C.tint
                    : C.icon + '44',
                },
              ]}>
              <ThemedText style={[styles.footerBtnText, { color: '#fff' }]}>
                {saving ? 'Saving…' : 'Save'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Tempo picker sub-sheet */}
      <TempoPickerSheet
        visible={tempoSheetIndex !== null}
        current={tempoSheetIndex !== null ? blocks[tempoSheetIndex].tempo : { kind: 'base' }}
        onClose={() => setTempoSheetIndex(null)}
        onPick={(ref) => {
          if (tempoSheetIndex !== null) updateBlock(tempoSheetIndex, { tempo: ref });
          setTempoSheetIndex(null);
        }}
      />
    </Modal>
  );
}

// ─── Tempo picker sub-sheet ──────────────────────────────────────────

function TempoPickerSheet({
  visible,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  current: TempoRef;
  onClose: () => void;
  onPick: (ref: TempoRef) => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [customBpm, setCustomBpm] = useState(
    current.kind === 'absolute' ? String(current.bpm) : '',
  );

  useEffect(() => {
    if (visible) setCustomBpm(current.kind === 'absolute' ? String(current.bpm) : '');
  }, [visible, current]);

  function isSelected(ref: TempoRef): boolean {
    if (current.kind !== ref.kind) return false;
    if (current.kind === 'base_plus' && ref.kind === 'base_plus') return current.delta === ref.delta;
    if (current.kind === 'absolute' && ref.kind === 'absolute') return current.bpm === ref.bpm;
    return true;
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.subSheet, { backgroundColor: C.background, borderColor: C.icon + '33' }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText style={[styles.title, { color: C.text }]}>Tempo for this block</ThemedText>

          <TempoOption label="Base" selected={isSelected({ kind: 'base' })} onPick={() => onPick({ kind: 'base' })} />
          {PRESET_DELTAS.map((d) => (
            <TempoOption
              key={d}
              label={`Base + ${d}`}
              selected={isSelected({ kind: 'base_plus', delta: d })}
              onPick={() => onPick({ kind: 'base_plus', delta: d })}
            />
          ))}
          <TempoOption
            label="Performance"
            selected={isSelected({ kind: 'performance' })}
            onPick={() => onPick({ kind: 'performance' })}
          />

          <View style={[styles.divider, { backgroundColor: C.icon + '22' }]} />
          <ThemedText style={[styles.fieldLabel, { color: C.icon }]}>
            Or set a specific BPM
          </ThemedText>
          <View style={styles.absoluteRow}>
            <TextInput
              value={customBpm}
              onChangeText={setCustomBpm}
              keyboardType="number-pad"
              placeholder="e.g. 144"
              placeholderTextColor={C.icon + '99'}
              style={[
                styles.absoluteInput,
                { borderColor: C.icon + '55', color: C.text },
              ]}
            />
            <Pressable
              onPress={() => {
                const n = parseInt(customBpm, 10);
                if (Number.isFinite(n) && n > 0) onPick({ kind: 'absolute', bpm: n });
              }}
              style={[styles.applyBtn, { backgroundColor: C.tint }]}>
              <ThemedText style={styles.applyBtnText}>Use</ThemedText>
            </Pressable>
          </View>

          <Pressable onPress={onClose} style={styles.subSheetCancel}>
            <ThemedText style={[styles.footerBtnText, { color: C.tint }]}>Cancel</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TempoOption({
  label,
  selected,
  onPick,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <Pressable
      onPress={onPick}
      style={({ pressed }) => [
        styles.tempoOpt,
        {
          backgroundColor: selected
            ? C.tint + '22'
            : pressed
              ? C.icon + '11'
              : 'transparent',
          borderColor: selected ? C.tint : 'transparent',
        },
      ]}>
      <ThemedText style={{ color: C.text, fontWeight: selected ? Type.weight.heavy : '400' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    overflow: 'hidden',
  },
  scroll: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  title: {
    fontSize: Type.size.lg,
    fontWeight: Type.weight.heavy,
  },
  helper: {
    fontSize: Type.size.sm,
    lineHeight: 19,
  },
  fieldLabel: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: Type.size.xs,
  },
  nameInput: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: Type.size.md,
  },
  blocksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
  },
  blockNum: {
    fontSize: Type.size.xs,
    fontWeight: Type.weight.heavy,
    width: 16,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  counterBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: Borders.thin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterGlyph: {
    fontSize: 18,
    fontWeight: Type.weight.heavy,
    lineHeight: 20,
  },
  counterValue: {
    fontSize: Type.size.md,
    fontWeight: Type.weight.heavy,
    minWidth: 22,
    textAlign: 'center',
  },
  timesGlyph: {
    fontSize: Type.size.md,
  },
  tempoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  tempoBtnText: {
    fontSize: Type.size.sm,
  },
  tempoBtnCaret: {
    fontSize: 12,
  },
  deleteBtn: {
    width: 28,
    alignItems: 'center',
  },
  deleteGlyph: {
    fontSize: 16,
  },
  addBtn: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingVertical: 10,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  addBtnText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
  },
  previewBox: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    minHeight: 56,
    justifyContent: 'center',
  },
  previewSummary: {
    fontSize: Type.size.xs,
  },
  errorText: {
    fontSize: Type.size.sm,
    marginTop: Spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radii.md,
    alignItems: 'center',
  },
  saveBtn: {
    // background set inline based on canSave
  },
  footerBtnText: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.heavy,
  },

  subSheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radii['2xl'],
    borderWidth: Borders.thin,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  tempoOpt: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  absoluteRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  absoluteInput: {
    flex: 1,
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: Type.size.md,
  },
  applyBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radii.md,
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
  },
  subSheetCancel: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
});
