import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Palette } from '@/constants/palette';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { addPhotoPassage } from '@/lib/photo/addPhotoPassage';

// Native "Add a passage" screen. Choose a photo from the library or take one
// with the camera → create a standalone image passage (local-first, syncs to
// the account when signed in) → open the crop screen. See lib/photo/addPhotoPassage.
export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const folderId = params.folder ? params.folder : null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createFrom(uri: string) {
    setBusy(true);
    setError(null);
    try {
      const { passageId } = await addPhotoPassage({ imageUri: uri, folderId });
      // Cast: expo-router typed routes regenerate when the dev server starts.
      router.replace(`/passage/${passageId}/crop` as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function choosePhoto() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo access is needed to choose a photo. Enable it in Settings.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    createFrom(res.assets[0].uri);
  }

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera access is needed to take a photo. Enable it in Settings.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    createFrom(res.assets[0].uri);
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Add a passage</ThemedText>
      <ThemedText style={styles.body}>
        Add a photo of a passage — choose one from your photos or take a new
        picture. You can crop it on the next screen.
      </ThemedText>

      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator color={Palette.accent} />
          <ThemedText style={styles.savingText}>Saving…</ThemedText>
        </View>
      ) : (
        <>
          <Button label="Choose photo" fullWidth onPress={choosePhoto} />
          <Button label="Take photo" variant="outline" fullWidth onPress={takePhoto} />
          <Pressable
            style={styles.multiPageBtn}
            onPress={() =>
              router.push({
                pathname: '/multi-page',
                params: { folder: folderId ?? '' },
              } as never)
            }>
            <ThemedText style={styles.multiPageText}>
              Passage spans two pages?
            </ThemedText>
          </Pressable>
        </>
      )}

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.xl, gap: Spacing.md, justifyContent: 'center' },
  body: { fontSize: Type.size.md, lineHeight: 24, color: Palette.textSecondary },
  center: { alignItems: 'center', padding: Spacing.md },
  savingText: { marginTop: Spacing.sm, color: Palette.textSecondary },
  error: { color: Palette.danger, fontSize: Type.size.sm },
  multiPageBtn: {
    alignSelf: 'center',
    borderWidth: Borders.thin,
    borderColor: Palette.border,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  multiPageText: { fontSize: Type.size.sm, color: Palette.textSecondary },
});
