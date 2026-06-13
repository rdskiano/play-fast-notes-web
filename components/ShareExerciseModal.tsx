// Publish a rhythm-builder exercise to the Community Rhythm Library. A copy of
// the exercise's config is shared (never a file) plus organizing metadata. The
// note grouping + pitch count are derived from the exercise (shown, not
// asked). The contributor's display name is remembered across shares.
// Pro-gating happens at the entry point before this modal opens.

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getSetting, setSetting } from '@/lib/db/repos/settings';
import {
  exerciseShapeLabel,
  groupingLabel,
  type ExerciseConfig,
} from '@/lib/community/exerciseConfig';
import { publishExercise } from '@/lib/community/exercises';
import { INSTRUMENTS } from '@/lib/music/pitch';

const NAME_KEY = 'community.contributor_name';

type Props = {
  visible: boolean;
  config: ExerciseConfig;
  /** Exercise title default (the in-app exercise name). */
  defaultTitle: string;
  /** Title of the work this came from. */
  defaultWorkTitle?: string;
  defaultComposer?: string;
  onPublished: () => void;
  onCancel: () => void;
};

export function ShareExerciseModal({
  visible,
  config,
  defaultTitle,
  defaultWorkTitle,
  defaultComposer,
  onPublished,
  onCancel,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [workTitle, setWorkTitle] = useState(defaultWorkTitle ?? '');
  const [composer, setComposer] = useState(defaultComposer ?? '');
  const [title, setTitle] = useState(defaultTitle);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setWorkTitle(defaultWorkTitle ?? '');
    setComposer(defaultComposer ?? '');
    setTitle(defaultTitle);
    setError(null);
    getSetting(NAME_KEY)
      .then((n) => setName(n ?? ''))
      .catch(() => {});
  }, [visible, defaultTitle, defaultWorkTitle, defaultComposer]);

  const instrumentLabel =
    INSTRUMENTS.find((i) => i.id === config.instrumentId)?.label ?? null;
  const canPublish =
    workTitle.trim().length > 0 &&
    composer.trim().length > 0 &&
    title.trim().length > 0 &&
    name.trim().length > 0 &&
    !busy;

  async function onSubmit() {
    if (!canPublish) return;
    setBusy(true);
    setError(null);
    try {
      await setSetting(NAME_KEY, name.trim());
      await publishExercise({
        title,
        config,
        contributorName: name,
        instrumentId: config.instrumentId ?? null,
        pieceTitle: workTitle,
        composer,
        timeSignature: groupingLabel(config),
      });
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { color: C.text, borderColor: C.icon + '88' }];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: C.background }]}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Publish to community
          </ThemedText>
          <ThemedText style={[styles.hint, { color: C.icon }]}>
            Shares this exercise (notation only — never your score) so other
            players can find and practice it.
          </ThemedText>

          <ScrollView
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ gap: Spacing.sm }}
            keyboardShouldPersistTaps="handled">
            <Field label="Title of work">
              <TextInput value={workTitle} onChangeText={setWorkTitle} style={inputStyle} placeholder="e.g. Symphony No. 4" placeholderTextColor={C.icon} />
            </Field>
            <Field label="Composer">
              <TextInput value={composer} onChangeText={setComposer} style={inputStyle} placeholder="e.g. Brahms" placeholderTextColor={C.icon} />
            </Field>
            <Field label="Title for this exercise">
              <TextInput value={title} onChangeText={setTitle} style={inputStyle} placeholder="e.g. mvt. 4 sixteenths, mm. 281–291" placeholderTextColor={C.icon} />
            </Field>
            <Field label="Your name (shown as the contributor)">
              <TextInput value={name} onChangeText={setName} style={inputStyle} placeholder="How you'd like to be credited" placeholderTextColor={C.icon} />
            </Field>

            <View style={[styles.shape, { borderColor: C.icon + '33' }]}>
              <ThemedText style={[styles.shapeText, { color: C.icon }]}>
                {exerciseShapeLabel(config)}
                {instrumentLabel ? ` · ${instrumentLabel}` : ''}
              </ThemedText>
            </View>
          </ScrollView>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <View style={styles.row}>
            <Button label="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} disabled={busy} />
            <Button label={busy ? 'Publishing…' : 'Publish'} onPress={onSubmit} style={{ flex: 1 }} disabled={!canPublish} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  return (
    <View style={{ gap: 4 }}>
      <ThemedText style={[styles.fieldLabel, { color: C.icon }]}>{label}</ThemedText>
      {children}
    </View>
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
    maxWidth: 460,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  hint: { textAlign: 'center', fontSize: Type.size.sm },
  fieldLabel: { fontSize: Type.size.xs, fontWeight: Type.weight.semibold },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: 15,
  },
  shape: {
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  shapeText: { fontSize: Type.size.sm, textAlign: 'center' },
  error: { color: '#c0392b', textAlign: 'center', fontSize: Type.size.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
});
