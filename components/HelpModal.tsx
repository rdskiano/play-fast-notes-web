// HelpModal (native) — the modal UI for the in-app help system, brought to
// parity with the web sibling so the installed app shows the same per-screen
// help. Rendered once globally by _layout.tsx. Both auto-fires (from
// <TutorialStep>) and manual opens (from <HelpButton>) flow through the
// context's `isOpen` state, so only one modal is ever on screen.
//
// If the user taps ? on a screen with no registered help, the modal shows a
// placeholder explaining the help is still being written.

import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { useHelpContext, type HelpContent } from '@/components/HelpContext';
import {
  formatClipLength,
  helpVideoAbsoluteUrl,
  helpVideosFor,
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
  body: "We're still writing the guide for this screen. Try tapping around — or check back later.",
};

// The app has no native video-player module (adding one would force a new
// App Store build), so tutorial videos play through a WebView — the same
// ship-over-the-air trick AbcStaffView uses for notation. The video streams
// from playfastnotes.com. Clips play FULLSCREEN on every device (Ralph's
// call 2026-08-18): with inline playback disallowed, iOS pushes the video
// into the system fullscreen player the moment it starts. The WebView
// itself stays 1px and invisible — it exists only to host playback — and
// it tells the RN side when the user is done (video ended, or they closed
// the fullscreen player) so the row can unmount it and guarantee silence.
function fullscreenPlayerHtml(video: HelpVideo): string {
  const src = helpVideoAbsoluteUrl(video);
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000}</style>
</head><body>
<video src="${src}" controls preload="metadata"></video>
<script>
var v = document.querySelector('video');
function done(){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('done'); }
v.addEventListener('ended', done);
v.addEventListener('webkitendfullscreen', function(){ v.pause(); done(); });
v.play();
</script>
</body></html>`;
}

function FullscreenClipPlayer({
  video,
  onDone,
}: {
  video: HelpVideo;
  onDone: () => void;
}) {
  return (
    <View style={styles.hiddenPlayer} pointerEvents="none">
      <WebView
        source={{ html: fullscreenPlayerHtml(video) }}
        originWhitelist={['*']}
        allowsInlineMediaPlayback={false}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        style={styles.hiddenPlayerFill}
        onMessage={(e) => {
          if (e.nativeEvent.data === 'done') onDone();
        }}
      />
    </View>
  );
}

export function HelpModal() {
  const { active, isOpen, close } = useHelpContext();
  const content = active ?? PLACEHOLDER;
  const videos = helpVideosFor(content.id);
  // Index of the clip currently playing fullscreen; mounts the hidden
  // player. Reset whenever the modal closes or the screen changes.
  const [playingClip, setPlayingClip] = useState<number | null>(null);
  useEffect(() => {
    setPlayingClip(null);
  }, [isOpen, content.id]);
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
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
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
                  video. Tapping a row plays that clip in the system
                  fullscreen player. The text body below stays as the
                  offline fallback. */}
              {isOpen && videos.length > 0 && (
                <View style={styles.clipList}>
                  {videos.map((v, i) => {
                    const playing = playingClip === i;
                    const length = formatClipLength(v.seconds);
                    return (
                      <View key={v.file}>
                        <Pressable
                          onPress={() => setPlayingClip(playing ? null : i)}
                          accessibilityRole="button"
                          style={[styles.clipRow, playing && styles.clipRowActive]}>
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
                        {playing && (
                          <FullscreenClipPlayer
                            video={v}
                            onDone={() => setPlayingClip(null)}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              <ThemedText style={styles.body}>{content.body}</ThemedText>

              {content.image && videos.length === 0 && (
                <View style={styles.imageWrap}>
                  {/* Tap to enlarge — opens the full-screen lightbox below. */}
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
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
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
  hiddenPlayer: {
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenPlayerFill: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
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
  clipRowActive: {
    borderColor: ACCENT,
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
