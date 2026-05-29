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
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Radii, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PLACEHOLDER: HelpContent = {
  id: '__placeholder__',
  title: 'No help here yet',
  body: "We're still writing the guide for this screen. Try clicking around — or check back later.",
};

export function HelpModal() {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const { active, isOpen, close } = useHelpContext();
  const content = active ?? PLACEHOLDER;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={close}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: C.background, borderColor: C.icon },
          ]}>
          {/* Scrolls when the body is taller than the capped card so the
              Close button below always stays reachable. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              {content.title}
            </ThemedText>
            <ThemedText style={[styles.body, { color: C.text }]}>
              {content.body}
            </ThemedText>

            {content.image && (
              <View style={styles.imageWrap}>
                {/* aspectRatio on RN-Web Image is unreliable — it gets
                    overridden by the asset's natural dimensions. Wrap a
                    View with the aspectRatio and let the Image fill it. */}
                <View
                  style={[
                    styles.imageFrame,
                    {
                      aspectRatio: content.image.aspectRatio,
                      borderColor: C.icon + '44',
                    },
                  ]}>
                  <Image
                    source={content.image.source}
                    resizeMode="contain"
                    style={styles.imageFill}
                    accessibilityLabel={content.image.caption ?? 'Help example image'}
                  />
                </View>
                {content.image.caption && (
                  <ThemedText
                    style={[styles.imageCaption, { color: C.text, opacity: Opacity.muted }]}>
                    {content.image.caption}
                  </ThemedText>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={close}
              style={[styles.btnPrimary, { backgroundColor: C.tint }]}
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
    borderWidth: Borders.thin,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: Spacing.md,
  },
  body: {
    fontSize: Type.size.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  imageWrap: {
    gap: Spacing.xs,
  },
  imageFrame: {
    width: '100%',
    borderRadius: Radii.md,
    borderWidth: Borders.thin,
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
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: Type.weight.heavy,
    fontSize: Type.size.sm,
  },
});
