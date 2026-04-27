import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/tokens';

export default function UploadScreen() {
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <ThemedText type="title" style={{ textAlign: 'center' }}>
          Add a piece
        </ThemedText>
        <ThemedText style={styles.body}>
          Uploading sheet music on the web is not built yet — it is the next
          screen we are porting. For now, you can sign in and out and explore
          the empty library.
        </ThemedText>
        <Button label="Back to Library" onPress={() => router.back()} fullWidth />
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
  body: {
    textAlign: 'center',
    opacity: 0.75,
    lineHeight: 22,
  },
});
