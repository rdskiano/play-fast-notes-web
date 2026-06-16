import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TutorialStep } from '@/components/TutorialStep';
import { Colors } from '@/constants/theme';
import { Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getPassage,
  insertPassage,
  renamePassage,
  updatePassageAssets,
  updatePassageCrop,
  type Passage,
} from '@/lib/db/repos/passages';
import { uploadPassageImage } from '@/lib/supabase/storage';

type Rect = { x: number; y: number; w: number; h: number };
type Handle = 'move' | 'tl' | 'tr' | 'bl' | 'br';

function newPassageId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const HANDLE_SIZE = 24;
const MIN_CROP = 40;
// Margin reserved around the fitted image inside the (overflow:hidden)
// container so the resize handles — which overhang the crop box by
// HANDLE_SIZE/2 — are never clipped at an image edge. Acute in landscape,
// where the image otherwise fills the full height and the top handles get cut.
const FIT_PAD = 18;

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for cropping'));
    img.src = url;
  });
}

async function getCroppedBlob(
  imageUrl: string,
  area: Rect,
): Promise<Blob> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.w);
  canvas.height = Math.round(area.h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(img, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/jpeg',
      0.9,
    );
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export default function CropScreen() {
  const { id, coach } = useLocalSearchParams<{ id: string; coach?: string }>();
  const isCoach = coach === '1';
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [namePromptVisible, setNamePromptVisible] = useState(false);
  // After a crop saves, offer the same choices the iPad app does: re-crop the
  // full image, crop another passage from it, or finish.
  const [whatNextVisible, setWhatNextVisible] = useState(false);
  // Whether the name prompt was opened after a real crop (→ show "What next?")
  // vs. after skipping the crop (→ go straight to the passage).
  const [nameThenWhatNext, setNameThenWhatNext] = useState(false);

  // The img's displayed rect, in CSS px relative to its container.
  const [imgRect, setImgRect] = useState<Rect | null>(null);
  // The img's natural pixel size.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  // The crop rectangle, in CSS px relative to the displayed img rect.
  const [crop, setCrop] = useState<Rect | null>(null);
  // The crop area's laid-out size, from onLayout (reliable across rotation;
  // getBoundingClientRect on image-load / window-resize read stale sizes).
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  // Last measured displayed-image rect. Used to rescale the crop when the
  // image rect changes (e.g. the phone rotates) so the crop keeps its
  // relative position/size instead of flying off the re-fit image.
  const imgRectRef = useRef<Rect | null>(null);

  const { width: winW, height: winH } = useWindowDimensions();
  const tightLandscape = winW > winH && Math.min(winW, winH) < 600;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Reset per-passage geometry so navigating from one passage's crop to
    // another's (via "Crop another passage") starts clean instead of briefly
    // showing the previous passage's crop box over the new image.
    setLoading(true);
    setPassage(null);
    setCrop(null);
    setNaturalSize(null);
    setImgRect(null);
    imgRectRef.current = null;
    setWhatNextVisible(false);
    setSaving(false);
    setError(null);
    getPassage(id)
      .then((p) => {
        if (!cancelled) setPassage(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The image the crop operates on: the full original if we have it, else the
  // current source (first-ever crop, or an uncropped passage). Cropping reads
  // and displays THIS, so re-opening Crop always reframes the full photo
  // instead of cropping further into a previous crop.
  const displaySrc = passage?.original_uri ?? passage?.source_uri ?? '';

  function resetCropToDefault() {
    const r = imgRectRef.current;
    if (r) setCrop({ x: r.w * 0.1, y: r.h * 0.1, w: r.w * 0.8, h: r.h * 0.8 });
    else setCrop(null);
  }

  // Derive the displayed image rect from the laid-out container size + the
  // image's natural size. object-fit:contain on the <img> handles the actual
  // painting; this just mirrors that geometry so the crop overlay lines up.
  // We fit inside an inset area (FIT_PAD) so the resize handles at the image
  // edges aren't clipped by the container's overflow:hidden. Recomputes on
  // rotation because onLayout updates containerSize.
  useEffect(() => {
    if (!containerSize || !naturalSize) return;
    const { w: cw, h: ch } = containerSize;
    const availW = Math.max(1, cw - FIT_PAD * 2);
    const availH = Math.max(1, ch - FIT_PAD * 2);
    const containerRatio = availW / availH;
    const imgRatio = naturalSize.w / naturalSize.h;
    let dispW: number;
    let dispH: number;
    if (imgRatio > containerRatio) {
      dispW = availW;
      dispH = availW / imgRatio;
    } else {
      dispH = availH;
      dispW = availH * imgRatio;
    }
    const x = (cw - dispW) / 2;
    const y = (ch - dispH) / 2;
    const newRect: Rect = { x, y, w: dispW, h: dispH };
    const prevRect = imgRectRef.current;
    imgRectRef.current = newRect;
    setImgRect(newRect);
    setCrop((prev) => {
      // Image rect changed under an existing crop (rotation / resize): rescale
      // the crop proportionally and clamp it back inside the new rect.
      if (prev && prevRect && prevRect.w > 0 && prevRect.h > 0) {
        const sx = dispW / prevRect.w;
        const sy = dispH / prevRect.h;
        const w = Math.min(prev.w * sx, dispW);
        const h = Math.min(prev.h * sy, dispH);
        const cx = clamp(prev.x * sx, 0, dispW - w);
        const cy = clamp(prev.y * sy, 0, dispH - h);
        return { x: cx, y: cy, w, h };
      }
      // First fit: start at 80% of the image, centered.
      return { x: dispW * 0.1, y: dispH * 0.1, w: dispW * 0.8, h: dispH * 0.8 };
    });
  }, [containerSize, naturalSize]);

  function onImgLoad() {
    const img = imgRef.current;
    if (img) setNaturalSize({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
  }

  // Drag/resize handler. We use pointer events for unified mouse + touch.
  const startDrag = useCallback(
    (e: React.PointerEvent, handle: Handle) => {
      if (!crop || !imgRect) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startCrop = { ...crop };
      const bounds = imgRect;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let next: Rect = { ...startCrop };

        if (handle === 'move') {
          next.x = clamp(startCrop.x + dx, 0, bounds.w - startCrop.w);
          next.y = clamp(startCrop.y + dy, 0, bounds.h - startCrop.h);
        } else if (handle === 'tl') {
          const newX = clamp(startCrop.x + dx, 0, startCrop.x + startCrop.w - MIN_CROP);
          const newY = clamp(startCrop.y + dy, 0, startCrop.y + startCrop.h - MIN_CROP);
          next.x = newX;
          next.y = newY;
          next.w = startCrop.x + startCrop.w - newX;
          next.h = startCrop.y + startCrop.h - newY;
        } else if (handle === 'tr') {
          const newY = clamp(startCrop.y + dy, 0, startCrop.y + startCrop.h - MIN_CROP);
          const newW = clamp(startCrop.w + dx, MIN_CROP, bounds.w - startCrop.x);
          next.y = newY;
          next.w = newW;
          next.h = startCrop.y + startCrop.h - newY;
        } else if (handle === 'bl') {
          const newX = clamp(startCrop.x + dx, 0, startCrop.x + startCrop.w - MIN_CROP);
          const newH = clamp(startCrop.h + dy, MIN_CROP, bounds.h - startCrop.y);
          next.x = newX;
          next.w = startCrop.x + startCrop.w - newX;
          next.h = newH;
        } else if (handle === 'br') {
          const newW = clamp(startCrop.w + dx, MIN_CROP, bounds.w - startCrop.x);
          const newH = clamp(startCrop.h + dy, MIN_CROP, bounds.h - startCrop.y);
          next.w = newW;
          next.h = newH;
        }

        setCrop(next);
      }

      function onUp() {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
      }

      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [crop, imgRect],
  );

  function onSkip() {
    if (isCoach) {
      router.replace(`/onboarding?passageId=${id}` as never);
    } else if (passage?.title === 'Untitled') {
      setNameThenWhatNext(false);
      setNamePromptVisible(true);
    } else {
      router.replace(`/passage/${id}`);
    }
  }

  async function onSave() {
    if (!passage || !crop || !imgRect || !naturalSize) return;
    setSaving(true);
    setError(null);
    try {
      // Map the displayed crop rect to the image's natural pixel coords.
      const ratio = naturalSize.w / imgRect.w;
      const area: Rect = {
        x: crop.x * ratio,
        y: crop.y * ratio,
        w: crop.w * ratio,
        h: crop.h * ratio,
      };
      // Crop from the full image (displaySrc) and save the crop WITHOUT
      // overwriting the original: the crop goes to a separate storage path and
      // the full image is preserved in original_uri.
      const original = passage.original_uri ?? passage.source_uri;
      const blob = await getCroppedBlob(displaySrc, area);
      const file = new File([blob], `${passage.id}.jpg`, { type: 'image/jpeg' });
      const publicUrl = await uploadPassageImage(passage.id, file, 'crop');
      await updatePassageCrop(passage.id, publicUrl, publicUrl, original);
      // Reflect the preserved original locally so a "Re-crop" right away still
      // reframes the full image.
      setPassage({ ...passage, source_uri: publicUrl, thumbnail_uri: publicUrl, original_uri: original });
      if (isCoach) {
        router.replace(`/onboarding?passageId=${passage.id}` as never);
      } else if (passage.title === 'Untitled') {
        setNameThenWhatNext(true);
        setNamePromptVisible(true);
      } else {
        setWhatNextVisible(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Create a new passage from the same full photo and jump to its Crop screen —
  // lets the user keep a small crop AND a wider one from one upload.
  async function cropAnotherPassage() {
    if (!passage) return;
    setWhatNextVisible(false);
    setSaving(true);
    setError(null);
    try {
      const fullUrl = passage.original_uri ?? passage.source_uri;
      const resp = await fetch(fullUrl);
      const blob = await resp.blob();
      const newId = newPassageId();
      const file = new File([blob], `${newId}.jpg`, { type: blob.type || 'image/jpeg' });
      await insertPassage({
        id: newId,
        title: 'Untitled',
        composer: null,
        source_kind: 'image',
        source_uri: '',
        thumbnail_uri: null,
        folder_id: passage.folder_id,
      });
      const publicUrl = await uploadPassageImage(newId, file);
      await updatePassageAssets(newId, publicUrl, publicUrl);
      router.replace(`/passage/${newId}/crop`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  async function handleName(name: string) {
    setNamePromptVisible(false);
    if (!passage) return;
    const trimmed = name.trim();
    if (trimmed) {
      try {
        await renamePassage(passage.id, trimmed);
        setPassage({ ...passage, title: trimmed });
      } catch {
        // ignore
      }
    }
    if (nameThenWhatNext) {
      setWhatNextVisible(true);
    } else {
      router.replace(`/passage/${passage.id}`);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={C.tint} />
      </ThemedView>
    );
  }

  if (!passage || !passage.source_uri) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={{ textAlign: 'center' }}>No image to crop.</ThemedText>
        <Button label="Back" variant="outline" onPress={() => router.back()} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.topBar,
          { borderBottomColor: C.icon + '44', paddingTop: insets.top + 14 },
        ]}>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onSkip} />
        <ThemedText style={styles.title}>Crop</ThemedText>
        <Button
          label={saving ? 'Saving…' : 'Save'}
          size="sm"
          onPress={onSave}
          disabled={saving || !crop}
        />
      </View>

      <ThemedText
        style={[styles.hint, { color: C.icon }, tightLandscape && styles.hintTight]}>
        {tightLandscape
          ? 'Drag the box or its corners to frame the passage.'
          : 'Drag the rectangle or its corners to select just the passage you want to practice. Your full photo is kept — after saving you can re-crop or crop another passage from it.'}
      </ThemedText>

      <View
        style={styles.cropOuter}
        onLayout={(e) =>
          setContainerSize({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            background: '#000',
            overflow: 'hidden',
            touchAction: 'none',
            userSelect: 'none',
          }}>
          <img
            ref={imgRef}
            src={displaySrc}
            alt=""
            onLoad={onImgLoad}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              // Explicit width/height inset by FIT_PAD (NOT auto — on a
              // replaced <img>, auto means the intrinsic/natural size, which
              // renders zoomed in). object-fit:contain fits the whole image
              // into this inset box, matching the imgRect overlay math and
              // leaving edge room for the handles.
              position: 'absolute',
              left: FIT_PAD,
              top: FIT_PAD,
              width: `calc(100% - ${FIT_PAD * 2}px)`,
              height: `calc(100% - ${FIT_PAD * 2}px)`,
              objectFit: 'contain',
              pointerEvents: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />

          {imgRect && crop && (
            <>
              {/* Dimming overlay outside the crop. Built from 4 rectangles
                  covering top/bottom/left/right of the crop area, scoped to
                  the displayed image rect (so letterbox bars stay solid black). */}
              <div
                style={{
                  position: 'absolute',
                  left: imgRect.x,
                  top: imgRect.y,
                  width: imgRect.w,
                  height: crop.y,
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: imgRect.x,
                  top: imgRect.y + crop.y + crop.h,
                  width: imgRect.w,
                  height: imgRect.h - (crop.y + crop.h),
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: imgRect.x,
                  top: imgRect.y + crop.y,
                  width: crop.x,
                  height: crop.h,
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: imgRect.x + crop.x + crop.w,
                  top: imgRect.y + crop.y,
                  width: imgRect.w - (crop.x + crop.w),
                  height: crop.h,
                  background: 'rgba(0,0,0,0.55)',
                  pointerEvents: 'none',
                }}
              />

              {/* Crop rectangle with its move/resize handles. */}
              <div
                onPointerDown={(e) => startDrag(e, 'move')}
                style={{
                  position: 'absolute',
                  left: imgRect.x + crop.x,
                  top: imgRect.y + crop.y,
                  width: crop.w,
                  height: crop.h,
                  border: '2px solid #fff',
                  boxSizing: 'border-box',
                  cursor: 'move',
                  touchAction: 'none',
                }}>
                {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => (
                  <div
                    key={pos}
                    onPointerDown={(e) => startDrag(e, pos)}
                    style={{
                      position: 'absolute',
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                      background: '#fff',
                      borderRadius: HANDLE_SIZE / 2,
                      boxShadow: '0 0 0 2px rgba(0,0,0,0.4)',
                      touchAction: 'none',
                      cursor:
                        pos === 'tl' || pos === 'br' ? 'nwse-resize' : 'nesw-resize',
                      ...(pos === 'tl' && { left: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }),
                      ...(pos === 'tr' && { right: -HANDLE_SIZE / 2, top: -HANDLE_SIZE / 2 }),
                      ...(pos === 'bl' && { left: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }),
                      ...(pos === 'br' && { right: -HANDLE_SIZE / 2, bottom: -HANDLE_SIZE / 2 }),
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </View>

      {error && (
        <View style={styles.errorWrap}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      )}

      <ActionSheet
        visible={whatNextVisible}
        title="Saved! What next?"
        items={[
          {
            label: 'Re-crop this passage',
            onPress: () => {
              setWhatNextVisible(false);
              resetCropToDefault();
            },
          },
          {
            label: 'Crop another passage from this photo',
            primary: true,
            onPress: cropAnotherPassage,
          },
          {
            label: 'Done',
            onPress: () => {
              setWhatNextVisible(false);
              router.replace(`/passage/${id}`);
            },
          },
        ]}
        cancelLabel="Done"
        onCancel={() => {
          setWhatNextVisible(false);
          router.replace(`/passage/${id}`);
        }}
      />

      <PromptModal
        visible={namePromptVisible}
        title="Name this passage"
        message="Pick something specific so you recognize it in your practice log — like a measure number, section name, or a fun label. Keep it positive!"
        placeholder="e.g. mm. 32-40, Coda, The Tricky Run"
        submitLabel="Save"
        onSubmit={handleName}
        onCancel={() => handleName('')}
      />

      <TutorialStep
        id="passage-crop"
        visible={false}
        title="Crop your passage"
        body={
          "Drag the corner handles to resize the crop, or drag the whole rectangle to reposition it, until it frames just the music you want to drill. Trim white margins, page edges, anything that distracts.\n\n" +
          "Tight crops zoom better on phone and tablet, so the staves are big enough to read while you play.\n\n" +
          "Tap \"Save\" to keep your crop. \"Skip cropping\" (and \"Cancel\" up top) proceed with the full, uncropped image instead. Either way, if the passage doesn't have a name yet you'll be prompted to name it before you land on the passage screen."
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: 14,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: Type.size.md, fontWeight: Type.weight.bold, flex: 1, textAlign: 'center' },
  hint: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    fontSize: Type.size.sm,
    lineHeight: 18,
    opacity: Opacity.muted,
    textAlign: 'center',
  },
  hintTight: {
    paddingVertical: 2,
    fontSize: Type.size.xs,
    lineHeight: 15,
  },
  cropOuter: {
    flex: 1,
    overflow: 'hidden',
  },
  errorWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  errorText: { color: '#c0392b', fontSize: Type.size.sm, textAlign: 'center' },
});
