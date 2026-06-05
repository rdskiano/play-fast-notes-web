import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addPhotoPassage } from '@/lib/photo/addPhotoPassage';

// Native "Add a passage" screen. Choose a photo from the library or take one
// with the camera → create a standalone image passage (local-first, syncs to
// the account when signed in) → open the crop screen. See lib/photo/addPhotoPassage.
export default function UploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folder?: string }>();
  const folderId = params.folder ? params.folder : null;
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

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
          <ActivityIndicator />
          <ThemedText style={{ marginTop: Spacing.sm, opacity: 0.7 }}>Saving…</ThemedText>
        </View>
      ) : (
        <>
          <Pressable style={[styles.btn, { backgroundColor: C.tint }]} onPress={choosePhoto}>
            <ThemedText style={styles.btnText}>Choose photo</ThemedText>
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: C.tint }]} onPress={takePhoto}>
            <ThemedText style={styles.btnText}>Take photo</ThemedText>
          </Pressable>
        </>
      )}

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: Spacing.md, justifyContent: 'center' },
  body: { fontSize: Type.size.md, lineHeight: 24, opacity: 0.7 },
  btn: {
    borderRadius: Radii.lg,
    padding: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.lg },
  center: { alignItems: 'center', padding: Spacing.md },
  error: { color: '#c0392b', fontSize: Type.size.sm },
});
