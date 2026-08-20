// The Practice Pro unlock sheet. Shown when a free user hits a Pro gate
// (4th passage, PDF upload) or taps an Unlock affordance. Same modal shell
// as ConfirmModal/PromptModal so it fits the app visually.
//
// One-time purchase: a single payment unlocks everything forever. The
// platform decides HOW: web hands off to Stripe checkout, iOS runs Apple's
// in-app purchase sheet (plus the App Store-required "Restore purchase").
// Both live behind usePurchase (lib/billing/usePurchase.{ts,web.ts}); this
// file stays shared. The buy section only mounts while the modal is visible,
// so StoreKit connects on demand rather than on every screen.

import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import {
  PRICE_LIFETIME_SUBLABEL,
  PRO_FEATURES,
  TRIAL_DAYS,
} from '@/constants/billing';
import { usePurchase } from '@/lib/billing/usePurchase';
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

/** The platform-aware purchase area. Mounted only while the modal is open —
 *  on iOS that's what scopes the StoreKit connection. */
function BuySection({
  onClose,
  mutedColor,
}: {
  onClose: () => void;
  mutedColor: string;
}) {
  const purchase = usePurchase();

  if (purchase.unlocked) {
    return (
      <>
        <ThemedText style={styles.unlockedLine}>
          ✓ Practice Pro is unlocked. Everything is open, forever.
        </ThemedText>
        <Button label="Done" onPress={onClose} />
      </>
    );
  }

  return (
    <>
      <Button
        label={
          purchase.busy
            ? 'One moment…'
            : `Unlock forever — ${purchase.priceLabel}`
        }
        onPress={purchase.buy}
        disabled={purchase.busy}
      />
      <ThemedText style={[styles.subLabel, { color: mutedColor }]}>
        {PRICE_LIFETIME_SUBLABEL}
      </ThemedText>

      <ThemedText style={[styles.finePrint, { color: mutedColor }]}>
        No subscription, nothing recurring. New accounts start with{' '}
        {TRIAL_DAYS} days of full Pro, free — and if you never buy, your
        music stays; extra passages just lock until you unlock.
      </ThemedText>

      {purchase.error && (
        <ThemedText style={styles.error}>{purchase.error}</ThemedText>
      )}

      {purchase.canRestore && (
        <Pressable onPress={purchase.restore} disabled={purchase.busy}>
          <ThemedText style={[styles.restoreLink, { color: mutedColor }]}>
            Already bought it? Restore purchase
          </ThemedText>
        </Pressable>
      )}

      <Button label="Not now" variant="outline" size="sm" onPress={onClose} />
    </>
  );
}

export function PaywallModal({ visible, contextLine, onClose }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

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

          {visible && <BuySection onClose={onClose} mutedColor={C.icon} />}
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
  restoreLink: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    textDecorationLine: 'underline',
  },
  unlockedLine: {
    textAlign: 'center',
    fontSize: Type.size.sm,
  },
  error: {
    textAlign: 'center',
    fontSize: Type.size.sm,
    color: Palette.danger,
  },
});
