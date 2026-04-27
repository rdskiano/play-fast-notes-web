import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { signInWithOtp } from '@/lib/supabase/auth';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

export default function SignInScreen() {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus({ kind: 'sending' });
    try {
      await signInWithOtp(trimmed);
      setStatus({ kind: 'sent', email: trimmed });
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (status.kind === 'sent') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.card}>
          <ThemedText type="title" style={styles.title}>
            Check your inbox
          </ThemedText>
          <ThemedText style={styles.body}>
            We sent a sign-in link to {status.email}. Open the email and tap the link to come
            back here.
          </ThemedText>
          <Button
            label="Use a different email"
            variant="ghost"
            size="sm"
            onPress={() => {
              setEmail('');
              setStatus({ kind: 'idle' });
            }}
          />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <ThemedText type="title" style={styles.title}>
          Play Fast Notes
        </ThemedText>
        <ThemedText style={styles.body}>
          Enter your email and we will send you a one-time link to sign in.
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={C.icon}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={[
            styles.input,
            { borderColor: C.icon, color: C.text, backgroundColor: C.background },
          ]}
          editable={status.kind !== 'sending'}
          onSubmitEditing={onSubmit}
        />

        <Button
          label={status.kind === 'sending' ? 'Sending…' : 'Send sign-in link'}
          onPress={onSubmit}
          disabled={status.kind === 'sending' || email.trim().length === 0}
          fullWidth
        />

        {status.kind === 'error' && (
          <ThemedText style={[styles.error, { color: '#c0392b' }]}>{status.message}</ThemedText>
        )}
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
    maxWidth: 400,
    gap: Spacing.lg,
  },
  title: { textAlign: 'center' },
  body: {
    textAlign: 'center',
    opacity: 0.75,
    fontSize: Type.size.md,
    lineHeight: 20,
  },
  input: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Type.size.lg,
  },
  error: {
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
});
