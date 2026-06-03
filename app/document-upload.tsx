import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Native sibling of document-upload.web.tsx.
//
// Multi-page PDF upload + page rendering is web-only: it relies on a browser
// file picker (<input type="file">) and pdf.js rasterizing pages onto a DOM
// canvas (lib/pdf/renderPdfClient.ts throws on native). The web-shaped screen
// crashes the instant it mounts on iPad. Until on-device PDF import exists,
// this native screen explains where to add full parts instead of crashing —
// parts added on the web sync down to the iPad automatically.
export default function DocumentUploadScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Add a full part (PDF)</ThemedText>
      <ThemedText style={styles.body}>
        Multi-page PDFs are added from the Play Fast Notes web app at
        playfastnotes.com. Anything you add there shows up here on your iPad
        automatically — there&apos;s no extra step.
      </ThemedText>
      <ThemedText style={[styles.body, { opacity: 0.6 }]}>
        Adding PDFs directly on the iPad is coming in a later update.
      </ThemedText>
      <Pressable
        style={[styles.btn, { backgroundColor: C.tint }]}
        onPress={() => router.back()}>
        <ThemedText style={styles.btnText}>Got it</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: Spacing.md, justifyContent: 'center' },
  body: { fontSize: Type.size.md, lineHeight: 24 },
  btn: {
    marginTop: Spacing.md,
    borderRadius: Radii.lg,
    padding: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: Type.weight.bold, fontSize: Type.size.xl },
});
