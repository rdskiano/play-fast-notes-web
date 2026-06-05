// Minimal email + password sign-in, shown when a sync-backed feature (Apple
// Pencil annotation) is used while signed out. Reuses continueWithPassword,
// which signs in to — or creates — the account.

import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { continueWithPassword } from '@/lib/supabase/auth';

export function SignInModal({
  visible,
  onClose,
  onSignedIn,
}: {
  visible: boolean;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await continueWithPassword(email, password);
      setEmail('');
      setPassword('');
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={styles.title}>
            Sign in to use the Pencil
          </ThemedText>
          <ThemedText style={styles.sub}>
            Apple Pencil marks save to your Play Fast Notes account so they
            also appear on the web app.
          </ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!busy}
          />
          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          <Pressable
            onPress={submit}
            disabled={busy}
            style={[styles.signInBtn, busy && { opacity: 0.6 }]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.signInText}>Sign in</ThemedText>
            )}
          </Pressable>
          <Pressable onPress={onClose} disabled={busy} hitSlop={8}>
            <ThemedText style={styles.cancel}>Cancel</ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000077',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radii['2xl'],
    padding: 22,
    gap: Spacing.md,
  },
  title: { textAlign: 'center' },
  sub: { textAlign: 'center', fontSize: Type.size.sm, opacity: 0.7 },
  input: {
    borderWidth: Borders.thin,
    borderColor: '#bbb',
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: Type.size.md,
    color: '#11181C',
  },
  error: { color: '#c0392b', fontSize: Type.size.sm, textAlign: 'center' },
  signInBtn: {
    backgroundColor: '#2ecc71',
    borderRadius: Radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signInText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
  },
  cancel: { textAlign: 'center', opacity: 0.6, fontSize: Type.size.sm },
});
