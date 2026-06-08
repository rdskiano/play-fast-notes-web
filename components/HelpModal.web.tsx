// HelpModal — the actual modal UI for the in-app help system.
//
// Rendered once globally by <HelpProvider>. Both auto-fires (from
// <TutorialStep>) and manual opens (from <HelpButton>) flow through
// the context's `isOpen` state, so only one modal is ever on screen.
//
// One button: Close. The permanent "Don't show again" flag is gone
// — the ? button is always one tap away, so suppression never needs
// to be user-facing. Auto-fires are session-deduped per id in the
// context, so closing won't trigger an immediate re-pop on navigation.
//
// If the user clicks ? on a screen with no registered help, the modal
// shows a placeholder explaining the help is still being written. This
// is intentional: forcing every screen to either have help OR show
// "coming soon" makes blank-help screens visible as a to-do list.

import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useHelpContext, type HelpContent } from '@/components/HelpContext';
import { Radii, Spacing, Type } from '@/constants/tokens';

// Match the guided-tour card so the help modal reads as the same coaching
// layer: dark slate panel, teal accent, light body text.
const CARD_BG = '#1e293b';
const CARD_TITLE = '#f8fafc';
const CARD_BODY = '#cbd5e1';
const ACCENT = '#e67e22'; // site orange

const PLACEHOLDER: HelpContent = {
  id: '__placeholder__',
  title: 'No help here yet',
  body: "We're still writing the guide for this screen. Try clicking around — or check back later.",
};

export function HelpModal() {
  const { active, isOpen, close } = useHelpContext();
  const content = active ?? PLACEHOLDER;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Scrolls when the body is taller than the capped card so the
              Close button below always stays reachable. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}>
            <ThemedText type="subtitle" style={styles.title}>
              {content.title}
            </ThemedText>
            <ThemedText style={styles.body}>{content.body}</ThemedText>

            {content.image && (
              <View style={styles.imageWrap}>
                {/* aspectRatio on RN-Web Image is unreliable — it gets
                    overridden by the asset's natural dimensions. Wrap a
                    View with the aspectRatio and let the Image fill it. */}
                <View
                  style={[
                    styles.imageFrame,
                    { aspectRatio: content.image.aspectRatio },
                  ]}>
                  <Image
                    source={content.image.source}
                    resizeMode="contain"
                    style={styles.imageFill}
                    accessibilityLabel={content.image.caption ?? 'Help example image'}
                  />
                </View>
                {content.image.caption && (
                  <ThemedText style={styles.imageCaption}>
                    {content.image.caption}
                  </ThemedText>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={close}
              style={styles.btnPrimary}
              accessibilityRole="button">
              <ThemedText style={styles.btnPrimaryText}>Close</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: Radii.xl,
    borderWidth: 1,
    backgroundColor: CARD_BG,
    borderColor: ACCENT + '55',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: Spacing.md,
  },
  title: {
    textAlign: 'center',
    color: CARD_TITLE,
  },
  body: {
    fontSize: Type.size.md,
    textAlign: 'center',
    lineHeight: 22,
    color: CARD_BODY,
  },
  imageWrap: {
    gap: Spacing.xs,
  },
  imageFrame: {
    width: '100%',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: ACCENT + '33',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  imageFill: {
    width: '100%',
    height: '100%',
  },
  imageCaption: {
    fontSize: Type.size.sm,
    textAlign: 'center',
    color: CARD_BODY,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  btnPrimary: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    backgroundColor: ACCENT,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
});
