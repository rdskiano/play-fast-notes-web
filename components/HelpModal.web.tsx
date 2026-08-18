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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useHelpContext, type HelpContent } from '@/components/HelpContext';
import {
  formatClipLength,
  helpVideosFor,
  helpVideoWebPath,
  type HelpVideo,
} from '@/constants/helpVideos';
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

// Tutorial clips play FULLSCREEN on every device (Ralph's call 2026-08-18:
// a card-sized video is useless on a phone, and on iPad/laptop fullscreen
// is simply better for "watch me do it"). One hidden <video> element is
// reused for all clips; a row tap loads the clip and pushes it into the
// browser's fullscreen player inside the same tap gesture, which is what
// the fullscreen APIs require. iOS Safari uses its own video-specific
// call (webkitEnterFullscreen); everyone else gets requestFullscreen.
function enterFullscreen(el: HTMLVideoElement) {
  const anyEl = el as HTMLVideoElement & {
    webkitEnterFullscreen?: () => void;
    webkitRequestFullscreen?: () => void;
  };
  if (anyEl.webkitEnterFullscreen) {
    // iOS needs the video's metadata before it can enter fullscreen; if
    // it isn't loaded yet, enter as soon as it is (still within the tap's
    // activation window).
    if (el.readyState >= 1) {
      anyEl.webkitEnterFullscreen();
    } else {
      el.addEventListener(
        'loadedmetadata',
        () => anyEl.webkitEnterFullscreen?.(),
        { once: true },
      );
    }
  } else if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if (anyEl.webkitRequestFullscreen) {
    anyEl.webkitRequestFullscreen();
  }
}

export function HelpModal() {
  const { active, isOpen, close } = useHelpContext();
  const content = active ?? PLACEHOLDER;
  const videos = helpVideosFor(content.id);
  // The shared fullscreen player element (see enterFullscreen above).
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const playClip = useCallback((v: HelpVideo) => {
    const el = playerRef.current;
    if (!el) return;
    el.src = helpVideoWebPath(v);
    el.play().catch(() => {});
    enterFullscreen(el);
  }, []);
  // Leaving fullscreen (or closing the modal) stops playback so audio
  // can never keep running behind the app.
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    const stop = () => {
      if (!document.fullscreenElement) {
        el.pause();
      }
    };
    el.addEventListener('webkitendfullscreen', stop);
    document.addEventListener('fullscreenchange', stop);
    return () => {
      el.removeEventListener('webkitendfullscreen', stop);
      document.removeEventListener('fullscreenchange', stop);
    };
  }, []);
  useEffect(() => {
    if (!isOpen) playerRef.current?.pause();
  }, [isOpen]);
  // The in-card example image is small; tapping it opens a full-screen
  // lightbox so the detail is actually readable.
  const [zoomed, setZoomed] = useState(false);
  // Reset the lightbox whenever the modal closes so it never reopens zoomed.
  useEffect(() => {
    if (!isOpen) setZoomed(false);
  }, [isOpen]);

  return (
    <>
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={close}>
        <View style={styles.backdrop}>
          {/* Videos need more width than text to be watchable, so the
              card grows when this screen has any. */}
          <View style={[styles.card, videos.length > 0 ? styles.cardWide : null]}>
            {/* Scrolls when the body is taller than the capped card so the
                Close button below always stays reachable. */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}>
              <ThemedText type="subtitle" style={styles.title}>
                {content.title}
              </ThemedText>

              {/* Tutorial clips, when this screen has entries in
                  constants/helpVideos.ts — a tap-to-play menu so the user
                  jumps to their question instead of scrubbing one long
                  video. Tapping a row plays that clip fullscreen. The text
                  body below stays as the offline fallback. */}
              {isOpen && videos.length > 0 && (
                <View style={styles.clipList}>
                  {videos.map((v) => {
                    const length = formatClipLength(v.seconds);
                    return (
                      <Pressable
                        key={v.file}
                        onPress={() => playClip(v)}
                        accessibilityRole="button"
                        style={styles.clipRow}>
                        <ThemedText style={styles.clipRowIcon}>▶</ThemedText>
                        <ThemedText style={styles.clipRowTitle}>
                          {v.title}
                        </ThemedText>
                        {length && (
                          <ThemedText style={styles.clipRowLength}>
                            {length}
                          </ThemedText>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <ThemedText style={styles.body}>{content.body}</ThemedText>

              {content.image && videos.length === 0 && (
                <View style={styles.imageWrap}>
                  {/* Tap to enlarge. aspectRatio on RN-Web Image is unreliable
                      — it gets overridden by the asset's natural dimensions —
                      so a View carries the aspectRatio and the Image fills it. */}
                  <Pressable
                    onPress={() => setZoomed(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Enlarge example image">
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
                    <ThemedText style={styles.enlargeHint}>🔍 Tap to enlarge</ThemedText>
                  </Pressable>
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

      {/* Full-screen lightbox for the example image — tap anywhere to close. */}
      <Modal
        visible={zoomed && !!content.image}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomed(false)}>
        <Pressable style={styles.lightboxBackdrop} onPress={() => setZoomed(false)}>
          {content.image && (
            <Image
              source={content.image.source}
              resizeMode="contain"
              style={styles.lightboxImage}
              accessibilityLabel={content.image.caption ?? 'Help example image'}
            />
          )}
          <ThemedText style={styles.lightboxHint}>Tap anywhere to close</ThemedText>
        </Pressable>
      </Modal>

      {/* The shared fullscreen player. Kept 1px and invisible — playback
          only ever happens in the browser's fullscreen UI, entered from a
          clip-row tap. `controls` gives the fullscreen view its scrubber
          on browsers that don't inject their own. */}
      <video
        ref={playerRef}
        controls
        preload="none"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </>
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
  cardWide: {
    maxWidth: 640,
  },
  clipList: {
    gap: Spacing.xs,
  },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: ACCENT + '33',
    backgroundColor: '#273449',
  },
  clipRowIcon: {
    color: ACCENT,
    fontSize: Type.size.md,
  },
  clipRowTitle: {
    flex: 1,
    color: CARD_TITLE,
    fontSize: Type.size.md,
    fontWeight: Type.weight.bold,
  },
  clipRowLength: {
    color: CARD_BODY,
    fontSize: Type.size.sm,
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
  enlargeHint: {
    fontSize: Type.size.sm,
    textAlign: 'center',
    color: ACCENT,
    fontWeight: Type.weight.bold,
    marginTop: Spacing.xs,
  },
  imageCaption: {
    fontSize: Type.size.sm,
    textAlign: 'center',
    color: CARD_BODY,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  lightboxImage: {
    width: '92%',
    height: '86%',
  },
  lightboxHint: {
    position: 'absolute',
    bottom: Spacing.lg,
    color: CARD_BODY,
    fontSize: Type.size.sm,
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
