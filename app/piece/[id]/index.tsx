import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/tokens';

export default function PieceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <ThemedText type="title" style={{ textAlign: 'center' }}>
          Piece detail
        </ThemedText>
        <ThemedText style={styles.body}>
          Piece <ThemedText type="defaultSemiBold">{id}</ThemedText> — the piece
          detail screen and practice strategies are not yet ported. Coming next.
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
