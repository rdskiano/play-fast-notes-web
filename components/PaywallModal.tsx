// The Practice Pro upgrade sheet. Shown when a free user hits a Pro gate
// (4th passage, PDF upload) or taps an Upgrade affordance. Same modal shell
// as ConfirmModal/PromptModal so it fits the app visually.
//
// Checkout is web-only for now: on native the buttons explain where to
// subscribe instead of calling Stripe. While PAYWALL_ENABLED is false this
// component is never mounted by the gates, but it can be opened from the
// account screen for preview/testing.

import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import {
  PRICE_ANNUAL_LABEL,
  PRICE_ANNUAL_SUBLABEL,
  PRICE_MONTHLY_LABEL,
  PRO_FEATURES,
  TRIAL_DAYS,
} from '@/constants/billing';
import { startCheckout, type CheckoutPlan } from '@/lib/billing/checkout';
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
  const [busy, setBusy] = useState<CheckoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(plan: CheckoutPlan) {
    if (Platform.OS !== 'web') {
      setError('Subscribe on the web at playfastnotes.com — your account syncs here.');
      return;
    }
    setBusy(plan);
    setError(null);
    try {
      await startCheckout(plan);
      // The browser navigates away on success; nothing more to do here.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.');
      setBusy(null);
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
            label={`${PRICE_ANNUAL_LABEL} — ${PRICE_ANNUAL_SUBLABEL}`}
            onPress={() => pick('annual')}
            disabled={busy !== null}
          />
          <Button
            label={PRICE_MONTHLY_LABEL}
            variant="outline"
            size="sm"
            onPress={() => pick('monthly')}
            disabled={busy !== null}
          />

          <ThemedText style={[styles.finePrint, { color: C.icon }]}>
            New accounts start with {TRIAL_DAYS} days of full Pro, free. Cancel
            anytime — your music stays; extra passages just lock until you
            return. Beta tester? Add your code at checkout.
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
  finePrint: {
    textAlign: 'center',
    fontSize: Type.size.xs,
  },
  error: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    color: '#c0392b',
  },
});
