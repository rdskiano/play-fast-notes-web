// The Practice Pro unlock sheet. Shown when a free user hits a Pro gate
// (4th passage, PDF upload) or taps an Unlock affordance. Same modal shell
// as ConfirmModal/PromptModal so it fits the app visually.
//
// One-time purchase: a single $19.99 payment unlocks everything forever.
// Checkout is web-only for now: on native the button explains where to buy
// instead of calling Stripe.

import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import {
  PRICE_LIFETIME_LABEL,
  PRICE_LIFETIME_SUBLABEL,
  PRO_FEATURES,
  TRIAL_DAYS,
} from '@/constants/billing';
import { startCheckout } from '@/lib/billing/checkout';
import { Palette } from '@/constants/palette';
import { Colors } from '@/constants/theme';
import { Overlays, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  visible: boolean;
  /** One line about what bumped into the gate, e.g. "PDF parts are a Pro
   *  feature." Defaults to a generic pitch. */
  contextLine?: string;
  onClose: () => void;
};

export function PaywallModal({ visible, contextLine, onClose }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (Platform.OS !== 'web') {
      setError('Buy on the web at playfastnotes.com — your account syncs here.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await startCheckout();
      // The browser navigates away on success; nothing more to do here.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  return (
    <Modal
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: C.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
            Practice Pro
          </ThemedText>
          {contextLine && (
            <ThemedText style={[styles.context, { color: C.icon }]}>
              {contextLine}
            </ThemedText>
          )}

          <View style={styles.features}>
            {PRO_FEATURES.map((f) => (
              <ThemedText key={f} style={styles.feature}>
                ✓ {f}
              </ThemedText>
            ))}
          </View>

          <Button
            label={`Unlock forever — ${PRICE_LIFETIME_LABEL}`}
            onPress={buy}
            disabled={busy}
          />
          <ThemedText style={[styles.subLabel, { color: C.icon }]}>
            {PRICE_LIFETIME_SUBLABEL}
          </ThemedText>

          <ThemedText style={[styles.finePrint, { color: C.icon }]}>
            No subscription, nothing recurring. New accounts start with{' '}
            {TRIAL_DAYS} days of full Pro, free — and if you never buy, your
            music stays; extra passages just lock until you unlock.
          </ThemedText>

          {error && (
            <ThemedText style={styles.error}>{error}</ThemedText>
          )}

          <Button label="Not now" variant="outline" size="sm" onPress={onClose} />
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
  context: {
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
  features: {
    gap: Spacing.xs,
    alignSelf: 'center',
  },
  feature: {
    fontSize: Type.size.sm,
  },
  subLabel: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    marginTop: -Spacing.sm,
  },
  finePrint: {
    textAlign: 'center',
    fontSize: Type.size.xs,
  },
  error: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    color: Palette.danger,
  },
});
