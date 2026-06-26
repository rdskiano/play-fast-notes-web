// FeedbackButton — a round "chat bubble" button that sits in a fixed corner
// (bottom-LEFT) as a sibling to the help "i" button (bottom-right). Tapping it
// opens a small box to email the developer; the current page, the device
// (userAgent), the signed-in email, and a timestamp are attached automatically,
// so a report lands with everything needed to look into it.
//
// Mounted once globally by _layout.tsx. It hides itself on the deep practice /
// session screens, where every corner is already taken by the rep buttons
// (✗ Miss bottom-left, ✓ Clean bottom-right), the EXIT button, and the dots
// pill — and where the player is mid-rep anyway. On those screens feedback is
// still reachable from Account → Send feedback.

import Feather from '@expo/vector-icons/Feather';
import { usePathname } from 'expo-router';
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
import { Palette } from '@/constants/palette';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/lib/supabase/auth';

// Public Formspree endpoint — safe to ship in the bundle. Override with
// EXPO_PUBLIC_FORMSPREE_URL if you ever need to point at a different inbox.
const FORMSPREE_URL =
  process.env.EXPO_PUBLIC_FORMSPREE_URL ?? 'https://formspree.io/f/mjglgqve';

// Route fragments that indicate an active practice/session screen, where the
// corners are crowded with rep buttons and the dots pill. The button hides on
// any path containing one of these. Covers both real passages
// (/passage/<id>/tempo-ladder) and the tools-only versions
// (/passage/__tools__/tempo-ladder, /tools/metronome), plus Rep Rotator and the
// onboarding quiz (which is its own guide).
const PRACTICE_FRAGMENTS = [
  'tempo-ladder',
  'click-up',
  'rhythmic',
  'chunking',
  'macro-chaining',
  'micro-chaining',
  'rhythm-builder',
  'self-led',
  'interleaved',
  'metronome',
  'onboarding',
];

function isHiddenRoute(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return PRACTICE_FRAGMENTS.some((frag) => p.includes(frag));
}

export function FeedbackButton() {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const session = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The "three devices" are all web surfaces (laptop, iPad Safari, phone
  // Safari). Native has no in-app feedback channel here — if that's wanted for
  // the App Store build, add one in Account rather than relying on this.
  if (Platform.OS !== 'web') return null;
  // Hide on the crowded practice screens (see PRACTICE_FRAGMENTS).
  if (isHiddenRoute(pathname)) return null;

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
        accessibilityRole="button"
        accessibilityLabel="Send feedback"
        style={({ pressed }) => [
          styles.fab,
          { opacity: pressed ? 0.85 : 1 },
        ]}>
        <Feather name="message-square" size={16} color="#fff" />
      </Pressable>

      <Modal
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
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
              Your email, the current page, and your device are included
              automatically — so I can look into it.
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
  // Round bottom-LEFT button, mirroring the help "i" (bottom-right) so the two
  // read as one chrome family. A warm color (vs the help button's petrol blue)
  // + the speech-bubble glyph distinguish "talk to me" from "info". Position is
  // inset-aware so the notch / home indicator never clips it in any orientation.
  fab: {
    position: 'absolute',
    // Flat 16 to mirror the help "i" button (bottom-right) exactly — using the
    // safe-area inset here made it ride higher than the help button on phones
    // with a home-indicator inset.
    bottom: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: Radii.circle,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: Palette.interleaved,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 100,
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
  error: { color: Palette.danger, fontSize: Type.size.sm, textAlign: 'center' },
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
