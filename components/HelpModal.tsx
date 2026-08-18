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
  DEFAULT_HELP_VIDEO_ASPECT,
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
// App Store build), so tutorial videos play inside a WebView — the same
// ship-over-the-air trick AbcStaffView uses for notation. The video streams
// from playfastnotes.com; `playsinline` + allowsInlineMediaPlayback keep it
// inside the card instead of hijacking the screen into fullscreen.
function videoPlayerHtml(video: HelpVideo): string {
  const src = helpVideoAbsoluteUrl(video);
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
video{width:100%;height:100%;display:block;object-fit:contain;background:#000}</style>
</head><body>
<video src="${src}" controls playsinline preload="metadata"></video>
</body></html>`;
}

// The player box. Portrait iPad recordings would tower over the card at
// full width, so they get a narrower, centered frame; landscape clips
// keep the full card width.
function VideoPlayer({ video }: { video: HelpVideo }) {
  const ratio = video.aspectRatio ?? DEFAULT_HELP_VIDEO_ASPECT;
  const portrait = ratio < 1;
  return (
    <View
      style={[
        styles.videoFrame,
        { aspectRatio: ratio },
        portrait && styles.videoFramePortrait,
      ]}>
      <WebView
        source={{ html: videoPlayerHtml(video) }}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        scrollEnabled={false}
        style={styles.videoFill}
      />
    </View>
  );
}

export function HelpModal() {
  const { active, isOpen, close } = useHelpContext();
  const content = active ?? PLACEHOLDER;
  const videos = helpVideosFor(content.id);
  // Which clip is playing. A single clip opens immediately (it IS the
  // help); a menu of clips starts closed so the user picks their question.
  const [openClip, setOpenClip] = useState<number | null>(null);
  useEffect(() => {
    setOpenClip(videos.length === 1 ? 0 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

              {/* Tutorial videos, when this screen has entries in
                  constants/helpVideos.ts. One clip renders as a player;
                  several render as a tap-to-play menu so the user jumps to
                  their question instead of scrubbing one long video. Gated
                  on isOpen so a closed modal can never keep audio playing.
                  The text body below stays as the offline fallback. */}
              {isOpen && videos.length === 1 && openClip === 0 && (
                <VideoPlayer key={content.id} video={videos[0]} />
              )}
              {isOpen && videos.length > 1 && (
                <View style={styles.clipList}>
                  {videos.map((v, i) => {
                    const playing = openClip === i;
                    const length = formatClipLength(v.seconds);
                    return (
                      <View key={v.file}>
                        <Pressable
                          onPress={() => setOpenClip(playing ? null : i)}
                          accessibilityRole="button"
                          style={[styles.clipRow, playing && styles.clipRowActive]}>
                          <ThemedText style={styles.clipRowIcon}>
                            {playing ? '▾' : '▸'}
                          </ThemedText>
                          <ThemedText style={styles.clipRowTitle}>
                            {v.title}
                          </ThemedText>
                          {length && (
                            <ThemedText style={styles.clipRowLength}>
                              {length}
                            </ThemedText>
                          )}
                        </Pressable>
                        {playing && <VideoPlayer video={v} />}
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
  videoFrame: {
    width: '100%',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: ACCENT + '33',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  videoFill: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoFramePortrait: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
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
