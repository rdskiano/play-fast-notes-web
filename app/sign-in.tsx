import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { continueWithPassword } from '@/lib/supabase/auth';

const MIN_PASSWORD = 6;

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string };

export default function SignInScreen() {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const emailOk = email.trim().length > 0 && email.includes('@');
  const passwordOk = password.length >= MIN_PASSWORD;
  const canSubmit = emailOk && passwordOk && status.kind !== 'submitting';

  async function onSubmit() {
    if (!canSubmit) return;
    setStatus({ kind: 'submitting' });
    try {
      await continueWithPassword(email, password);
      // Successful sign-in. The auth state listener in _layout will see the
      // session, but the URL is still /sign-in — push to Library explicitly so
      // the user lands somewhere on success.
      router.replace('/library');
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.card}>
        <ThemedText type="title" style={styles.title}>
          Play Fast Notes
        </ThemedText>
        <ThemedText style={styles.body}>
          Enter your email and a password. New emails create an account; existing
          emails sign in.
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
          editable={status.kind !== 'submitting'}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={`Password (${MIN_PASSWORD}+ characters)`}
          placeholderTextColor={C.icon}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[
            styles.input,
            { borderColor: C.icon, color: C.text, backgroundColor: C.background },
          ]}
          editable={status.kind !== 'submitting'}
          onSubmitEditing={onSubmit}
        />

        <Button
          label={status.kind === 'submitting' ? 'Signing in…' : 'Continue'}
          onPress={onSubmit}
          disabled={!canSubmit}
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
