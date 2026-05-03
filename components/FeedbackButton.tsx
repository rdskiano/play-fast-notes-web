import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/lib/supabase/auth';

// Public Formspree endpoint — safe to ship in the bundle. Override with
// EXPO_PUBLIC_FORMSPREE_URL if you ever need to point at a different inbox.
const FORMSPREE_URL =
  process.env.EXPO_PUBLIC_FORMSPREE_URL ?? 'https://formspree.io/f/mjglgqve';

export function FeedbackButton() {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web only — the iPad app has its own channels (and the parity rule says
  // no web-only UI; this is the user-requested exception that lives only in
  // play-fast-notes-web).
  if (Platform.OS !== 'web') return null;

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!FORMSPREE_URL) {
      setError(
        'Feedback endpoint is not configured. Set EXPO_PUBLIC_FORMSPREE_URL.',
      );
      return;
    }
    setSending(true);
    setError(null);
    try {
      const page =
        typeof window !== 'undefined' ? window.location.href : 'unknown';
      const userAgent =
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
      const userEmail = session?.user.email ?? 'anonymous';
      const userId = session?.user.id ?? 'anonymous';
      const res = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          // The `email` field is the Formspree convention for the
          // reply-to address — replying to the notification email goes
          // straight to the user.
          email: userEmail,
          userId,
          feedback: trimmed,
          page,
          userAgent,
          timestamp: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`);
      }
      setDone(true);
      setText('');
      setTimeout(() => {
        setDone(false);
        setOpen(false);
      }, 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function close() {
    if (sending) return;
    setOpen(false);
    setError(null);
    setDone(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.fab, { backgroundColor: C.tint }]}
        accessibilityLabel="Send feedback">
        <ThemedText style={styles.fabText}>💬 Feedback</ThemedText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}>
        <View style={styles.backdrop}>
          <View
            style={[
              styles.card,
              { backgroundColor: C.background, borderColor: C.icon },
            ]}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              Send feedback
            </ThemedText>
            <ThemedText style={[styles.hint, { color: C.icon }]}>
              Your email, the current page, and a timestamp are included
              automatically.
            </ThemedText>

            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="What is working? What is broken? What would help?"
              placeholderTextColor={C.icon}
              style={[
                styles.textarea,
                { color: C.text, borderColor: C.icon + '88' },
              ]}
              multiline
              numberOfLines={6}
              autoFocus
              editable={!sending && !done}
            />

            {error && <ThemedText style={styles.error}>{error}</ThemedText>}

            {done ? (
              <ThemedText style={[styles.done, { color: C.tint }]}>
                ✓ Thanks — sent.
              </ThemedText>
            ) : (
              <View style={styles.buttonRow}>
                <Pressable
                  onPress={close}
                  disabled={sending}
                  style={[
                    styles.btn,
                    styles.btnCancel,
                    { borderColor: C.icon, opacity: sending ? 0.5 : 1 },
                  ]}>
                  <ThemedText
                    style={[styles.btnCancelText, { color: C.text }]}>
                    Cancel
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={submit}
                  disabled={sending || !text.trim()}
                  style={[
                    styles.btn,
                    {
                      backgroundColor: C.tint,
                      opacity: !text.trim() || sending ? 0.5 : 1,
                    },
                  ]}>
                  <ThemedText style={styles.btnText}>
                    {sending ? 'Sending…' : 'Send'}
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii['2xl'],
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 1000,
  },
  fabText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: Radii.xl,
    borderWidth: Borders.thin,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  hint: {
    fontSize: Type.size.xs,
    textAlign: 'center',
    opacity: Opacity.muted,
    marginTop: -4,
  },
  textarea: {
    borderWidth: Borders.thin,
    borderRadius: Radii.md,
    padding: 12,
    fontSize: Type.size.md,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  error: { color: '#c0392b', fontSize: Type.size.sm, textAlign: 'center' },
  done: {
    textAlign: 'center',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.md,
    paddingVertical: Spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
  },
  btn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
  },
  btnText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
  btnCancel: { borderWidth: Borders.thin },
  btnCancelText: {
    fontWeight: Type.weight.bold,
    fontSize: Type.size.sm,
  },
});
