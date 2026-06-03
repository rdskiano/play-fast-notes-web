import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Native sibling of upload.web.tsx.
//
// The single-passage photo upload screen is web-only: it uses a browser file
// picker / camera <input> and the DOM drag-and-drop drop zone, so the
// web-shaped version crashes on mount on iPad. Until a native capture flow
// (document scanner / image picker → crop → save) is wired up, this screen
// explains where to add passages instead of crashing. Passages added on the
// web sync down to the iPad automatically.
export default function UploadScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Add a passage</ThemedText>
      <ThemedText style={styles.body}>
        New passages are added from the Play Fast Notes web app at
        playfastnotes.com. Anything you add there shows up here on your iPad
        automatically — there&apos;s no extra step.
      </ThemedText>
      <ThemedText style={[styles.body, { opacity: 0.6 }]}>
        Adding passages directly on the iPad is coming in a later update.
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
