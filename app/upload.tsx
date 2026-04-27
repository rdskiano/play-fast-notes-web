import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { insertPiece } from '@/lib/db/repos/pieces';

function newPieceId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const folderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0 && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await insertPiece({
        id: newPieceId(),
        title: title.trim(),
        composer: composer.trim() || null,
        source_kind: 'image',
        // Image upload comes in the next iteration (needs Supabase Storage).
        // Empty placeholder for now; library + piece detail handle absent
        // thumbnails gracefully.
        source_uri: '',
        thumbnail_uri: null,
        folder_id: folderId,
      });
      router.replace('/library');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <ThemedText type="title" style={{ textAlign: 'center' }}>
          Add a piece
        </ThemedText>
        <ThemedText style={styles.subtle}>
          Image upload is coming next. For now, save a piece by name so you can
          try the practice strategies on it.
        </ThemedText>

        <View style={{ gap: Spacing.sm }}>
          <ThemedText style={styles.label}>Title</ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Bach Invention No. 1"
            placeholderTextColor={C.icon}
            autoCapitalize="words"
            style={[
              styles.input,
              { borderColor: C.icon, color: C.text, backgroundColor: C.background },
            ]}
            editable={!saving}
          />
        </View>

        <View style={{ gap: Spacing.sm }}>
          <ThemedText style={styles.label}>Composer (optional)</ThemedText>
          <TextInput
            value={composer}
            onChangeText={setComposer}
            placeholder="e.g. J.S. Bach"
            placeholderTextColor={C.icon}
            autoCapitalize="words"
            style={[
              styles.input,
              { borderColor: C.icon, color: C.text, backgroundColor: C.background },
            ]}
            editable={!saving}
            onSubmitEditing={onSave}
          />
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <View style={styles.row}>
          <Button
            label="Cancel"
            variant="outline"
            onPress={() => router.back()}
            style={{ flex: 1 }}
          />
          <Button
            label={saving ? 'Saving…' : 'Save'}
            onPress={onSave}
            disabled={!canSave}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    gap: Spacing.lg,
  },
  subtle: {
    textAlign: 'center',
    opacity: 0.65,
    fontSize: Type.size.sm,
    lineHeight: 18,
  },
  label: {
    fontSize: Type.size.sm,
    fontWeight: Type.weight.semibold,
    opacity: 0.8,
  },
  input: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Type.size.lg,
  },
  error: {
    color: '#c0392b',
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
});
