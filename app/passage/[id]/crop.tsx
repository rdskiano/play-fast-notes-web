import { Directory, File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { CropView } from '@/components/CropView';
import { PromptModal } from '@/components/PromptModal';
import { ThemedView } from '@/components/themed-view';
import { getPassage, insertPassage, renamePassage, softDeletePassage, updatePassageAssets, type Passage } from '@/lib/db/repos/passages';
import { importImage } from '@/lib/files/import';

export default function CropScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [passage, setPassage] = useState<Passage | null>(null);
  const [activePassageId, setActivePassageId] = useState(id);
  const [saving, setSaving] = useState(false);
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  const [pendingOriginalCopy, setPendingOriginalCopy] = useState<File | null>(null);

  useEffect(() => {
    if (!activePassageId) return;
    getPassage(activePassageId).then(setPassage);
  }, [activePassageId]);

  function resetForNewPassage(newId: string) {
    setActivePassageId(newId);
  }

  async function handleCrop(croppedUri: string) {
    if (!passage || !activePassageId) return;
    setSaving(true);
    try {
      const piecesDir = new Directory(Paths.document, 'pieces');
      if (!piecesDir.exists) piecesDir.create({ intermediates: true });

      const originalUri = passage.source_uri;
      const originalCopy = new File(piecesDir, `${passage.id}.original.jpg`);
      try {
        new File(originalUri).copy(originalCopy);
      } catch {}

      const stamp = Date.now();
      const newSource = new File(piecesDir, `${passage.id}.${stamp}.jpg`);
      new File(croppedUri).copy(newSource);

      const thumbResult = await ImageManipulator.manipulateAsync(
        newSource.uri,
        [{ resize: { width: 400 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );
      const newThumb = new File(piecesDir, `${passage.id}.${stamp}.thumb.jpg`);
      new File(thumbResult.uri).copy(newThumb);

      try {
        const oldSrc = new File(originalUri);
        if (oldSrc.uri !== originalCopy.uri && oldSrc.exists) oldSrc.delete();
      } catch {}
      try {
        if (passage.thumbnail_uri) {
          const oldThumb = new File(passage.thumbnail_uri);
          if (oldThumb.exists) oldThumb.delete();
        }
      } catch {}

      await updatePassageAssets(passage.id, newSource.uri, newThumb.uri);

      setPendingOriginalCopy(originalCopy);
      setNamePromptVisible(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (passage?.title === 'Untitled') {
      await softDeletePassage(activePassageId!);
      router.dismissAll();
    } else {
      router.dismissAll();
      router.push(`/passage/${activePassageId}`);
    }
  }

  async function handleName(name: string) {
    if (!passage) return;
    setNamePromptVisible(false);
    const title = name || 'Untitled';
    await renamePassage(passage.id, title);

    const originalCopy = pendingOriginalCopy;
    setPendingOriginalCopy(null);

    Alert.alert(
      'What next?',
      'Re-crop the same passage, crop another passage from this image, or finish.',
      [
        {
          text: 'Re-crop this passage',
          onPress: async () => {
            if (!originalCopy || !originalCopy.exists) {
              router.dismissAll();
              router.push(`/passage/${activePassageId}`);
              return;
            }
            try {
              const piecesDir = new Directory(Paths.document, 'pieces');
              if (!piecesDir.exists) piecesDir.create({ intermediates: true });
              const stamp = Date.now();
              const restoredSource = new File(piecesDir, `${passage.id}.${stamp}.jpg`);
              originalCopy.copy(restoredSource);
              const thumbResult = await ImageManipulator.manipulateAsync(
                restoredSource.uri,
                [{ resize: { width: 400 } }],
                { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
              );
              const restoredThumb = new File(piecesDir, `${passage.id}.${stamp}.thumb.jpg`);
              new File(thumbResult.uri).copy(restoredThumb);
              // Remove the cropped files we just wrote.
              try {
                const oldSrc = new File(passage.source_uri);
                if (oldSrc.exists) oldSrc.delete();
              } catch {}
              try {
                if (passage.thumbnail_uri) {
                  const oldThumb = new File(passage.thumbnail_uri);
                  if (oldThumb.exists) oldThumb.delete();
                }
              } catch {}
              await updatePassageAssets(passage.id, restoredSource.uri, restoredThumb.uri);
              try { if (originalCopy.exists) originalCopy.delete(); } catch {}
              // Reload the passage on the crop screen so CropView reopens with
              // the restored full image.
              const refreshed = await getPassage(passage.id);
              setPassage(refreshed);
            } catch {
              try { if (originalCopy.exists) originalCopy.delete(); } catch {}
              router.dismissAll();
              router.push(`/passage/${activePassageId}`);
            }
          },
        },
        {
          text: 'Crop another passage',
          onPress: async () => {
            try {
              const imported = await importImage(originalCopy!.uri);
              const newPassage = await insertPassage({
                id: imported.id,
                title: 'Untitled',
                source_kind: 'image',
                source_uri: imported.source_uri,
                thumbnail_uri: imported.thumbnail_uri,
                folder_id: passage.folder_id,
              });
              try { if (originalCopy?.exists) originalCopy.delete(); } catch {}
              resetForNewPassage(newPassage.id);
            } catch {
              try { if (originalCopy?.exists) originalCopy.delete(); } catch {}
              router.dismissAll();
              router.push(`/passage/${activePassageId}`);
            }
          },
        },
        {
          text: 'Done',
          style: 'cancel',
          onPress: () => {
            try { if (originalCopy?.exists) originalCopy.delete(); } catch {}
            router.dismissAll();
            router.navigate('/(tabs)/library');
            router.push(`/passage/${activePassageId}`);
          },
        },
      ],
    );
  }

  if (!passage) return <ThemedView style={styles.loading} />;

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerShown: false,
          autoHideHomeIndicator: true,
        }}
      />
      <CropView
        key={activePassageId}
        imageUri={passage.source_uri}
        onCrop={handleCrop}
        onCancel={handleCancel}
        saving={saving}
        hint="Drag the corners to select just the passage you want to practice."
      />
      <PromptModal
        visible={namePromptVisible}
        title="Name this passage"
        message="Pick something specific so you can recognize it in your practice log — like a measure number, section name, or a fun label. Keep it positive!"
        placeholder="e.g. mm. 32-40, Coda, The Tricky Run"
        submitLabel="Save"
        onSubmit={handleName}
        onCancel={() => handleName('')}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
});
