// Native "Add page" controller — sibling of AddPageButton.web.tsx (which is a
// hidden file input). On iPad/iPhone trigger() opens a chooser: scan pages with
// the camera (VisionKit, cleaned to B&W like the create-scan path) or pick
// photos from the library (kept as photos). New pages append to the document
// via lib/scan/appendDocumentPages — local-first, background cloud sync.
//
// Mounted once at the viewer root (same as web) so it survives the phone ⋯
// menu closing after the tap that triggers it.

import * as ImagePicker from 'expo-image-picker';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { Alert } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import type { DocumentPage } from '@/lib/db/repos/documents';
import { appendDocumentPages } from '@/lib/scan/appendDocumentPages';

export type AddPageHandle = { trigger: () => void };

type Props = {
  documentId: string;
  pages: DocumentPage[];
  onAdded: (pages: DocumentPage[]) => void;
  onBusyChange?: (busy: boolean) => void;
};

export const AddPageButton = forwardRef<AddPageHandle, Props>(function AddPageButton(
  { documentId, onAdded, onBusyChange },
  ref,
) {
  const [sheetOpen, setSheetOpen] = useState(false);

  useImperativeHandle(ref, () => ({ trigger: () => setSheetOpen(true) }), []);

  async function append(imageUris: string[], kind: 'scan' | 'photo') {
    if (imageUris.length === 0) return;
    onBusyChange?.(true);
    try {
      const next = await appendDocumentPages({ documentId, imageUris, kind });
      onAdded(next);
    } catch (err) {
      Alert.alert('Add page', `Couldn't add that page: ${(err as Error).message}`);
    } finally {
      onBusyChange?.(false);
    }
  }

  async function scanPages() {
    try {
      // Lazy require — a top-level import runs a TurboModule lookup that breaks
      // web bundling of the shared route file (see app/document-upload.tsx).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DocumentScanner = require('react-native-document-scanner-plugin').default;
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        croppedImageQuality: 100,
      });
      if (status !== 'success' || !scannedImages || scannedImages.length === 0) return;
      await append(scannedImages, 'scan');
    } catch (err) {
      Alert.alert('Add page', `Couldn't scan: ${(err as Error).message}`);
    }
  }

  async function choosePhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Add page', 'Photo access is needed to choose a photo. Enable it in Settings.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 12,
      orderedSelection: true,
    });
    if (res.canceled || !res.assets?.length) return;
    await append(
      res.assets.map((a) => a.uri),
      'photo',
    );
  }

  return (
    <ActionSheet
      visible={sheetOpen}
      title="Add pages at the end"
      items={[
        {
          label: '📷 Scan pages with the camera',
          onPress: () => {
            setSheetOpen(false);
            // Let the sheet's Modal finish dismissing before presenting the
            // scanner's view controller — presenting during the dismiss
            // animation silently no-ops on iOS.
            setTimeout(() => void scanPages(), 400);
          },
        },
        {
          label: '🖼 Choose photos',
          onPress: () => {
            setSheetOpen(false);
            setTimeout(() => void choosePhotos(), 400);
          },
        },
      ]}
      onCancel={() => setSheetOpen(false)}
    />
  );
});
