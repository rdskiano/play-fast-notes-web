// Closes the loop on Stripe Checkout. create-checkout-session sends the
// browser back to the app with ?checkout=success | already | cancelled —
// until this component existed, NOTHING read those params, so a user who had
// just paid $19.99 landed on the library with zero confirmation ("did that
// work?!"), and a comp/lifetime holder bounced by the double-charge guard saw
// a button that silently did nothing.
//
// Mounted once in the signed-in branch of app/_layout.tsx (web only — the
// .tsx sibling is a native no-op; checkout is web-only until Apple IAP).
// Reads the param on mount, strips it from the URL immediately (so reload /
// back / share don't re-trigger it), then shows one themed modal.

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Result = 'success' | 'already' | 'cancelled';

const COPY: Record<Result, { title: string; body: string; button: string }> = {
  success: {
    title: 'You’re in — thank you! 🎉',
    body:
      'Payment received. Practice Pro is yours forever — unlimited passages, ' +
      'full PDF parts, the Exercise Builder, every strategy. If the Account ' +
      'page doesn’t say so yet, give it a few seconds and reload.',
    button: 'Start practicing',
  },
  already: {
    title: 'Already unlocked',
    body:
      'Practice Pro is already active on this account, so checkout closed ' +
      'itself. You were not charged.',
    button: 'OK',
  },
  cancelled: {
    title: 'Checkout cancelled',
    body: 'No charge was made. The unlock is here whenever you want it.',
    button: 'OK',
  },
};

function readAndStripParam(): Result | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get('checkout');
  if (value !== 'success' && value !== 'already' && value !== 'cancelled') {
    return null;
  }
  params.delete('checkout');
  const rest = params.toString();
  const next =
    window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash;
  window.history.replaceState(null, '', next);
  return value;
}

export function CheckoutResultModal() {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    setResult(readAndStripParam());
  }, []);

  if (!result) return null;
  const copy = COPY[result];
  const close = () => setResult(null);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.card, { backgroundColor: C.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            {copy.title}
          </ThemedText>
          <ThemedText style={[styles.message, { color: C.icon }]}>
            {copy.body}
          </ThemedText>
          <Button label={copy.button} onPress={close} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Overlays.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  message: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    lineHeight: 20,
  },
});
