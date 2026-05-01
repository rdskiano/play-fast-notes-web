import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { PromptModal } from '@/components/PromptModal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getPiece, renamePiece, updatePieceAssets, type Piece } from '@/lib/db/repos/pieces';
import { uploadPieceImage } from '@/lib/supabase/storage';

type Rect = { x: number; y: number; w: number; h: number };
type Handle = 'move' | 'tl' | 'tr' | 'bl' | 'br';

const HANDLE_SIZE = 24;
const MIN_CROP = 40;

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [piece, setPiece] = useState<Piece | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [namePromptVisible, setNamePromptVisible] = useState(false);

  // The img's displayed rect, in CSS px relative to its container.
  const [imgRect, setImgRect] = useState<Rect | null>(null);
  // The img's natural pixel size.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  // The crop rectangle, in CSS px relative to the displayed img rect.
  const [crop, setCrop] = useState<Rect | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPiece(id)
      .then((p) => {
        if (!cancelled) setPiece(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Compute the displayed rect of the <img> within its container so we can
  // position the crop overlay correctly. object-fit:contain pads with letterbox
  // bars; we need to know the actual painted rect.
  const measureImg = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const containerRect = container.getBoundingClientRect();
    const natW = img.naturalWidth || 1;
    const natH = img.naturalHeight || 1;
    const containerRatio = containerRect.width / containerRect.height;
    const imgRatio = natW / natH;
    let dispW: number;
    let dispH: number;
    if (imgRatio > containerRatio) {
      dispW = containerRect.width;
      dispH = containerRect.width / imgRatio;
    } else {
      dispH = containerRect.height;
      dispW = containerRect.height * imgRatio;
    }
    const x = (containerRect.width - dispW) / 2;
    const y = (containerRect.height - dispH) / 2;
    const newRect: Rect = { x, y, w: dispW, h: dispH };
    setImgRect(newRect);
    setNaturalSize({ w: natW, h: natH });
    // Initialize the crop rect to 80% of the image, centered.
    setCrop((prev) =>
      prev ?? {
        x: dispW * 0.1,
        y: dispH * 0.1,
        w: dispW * 0.8,
        h: dispH * 0.8,
      },
    );
  }, []);

  useEffect(() => {
    if (!piece?.source_uri) return;
    function onResize() {
      measureImg();
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [piece?.source_uri, measureImg]);

  function onImgLoad() {
    measureImg();
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
    if (piece?.title === 'Untitled') {
      setNamePromptVisible(true);
    } else {
      router.replace(`/piece/${id}`);
    }
  }

  async function onSave() {
    if (!piece || !crop || !imgRect || !naturalSize) return;
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
      const blob = await getCroppedBlob(piece.source_uri, area);
      const file = new File([blob], `${piece.id}.jpg`, { type: 'image/jpeg' });
      const publicUrl = await uploadPieceImage(piece.id, file);
      await updatePieceAssets(piece.id, publicUrl, publicUrl);
      if (piece.title === 'Untitled') {
        setNamePromptVisible(true);
      } else {
        router.replace(`/piece/${piece.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleName(name: string) {
    setNamePromptVisible(false);
    if (!piece) return;
    const trimmed = name.trim();
    if (trimmed) {
      try {
        await renamePiece(piece.id, trimmed);
      } catch {
        // ignore
      }
    }
    router.replace(`/piece/${piece.id}`);
  }

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color={C.tint} />
      </ThemedView>
    );
  }

  if (!piece || !piece.source_uri) {
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

      <View style={[styles.topBar, { borderBottomColor: C.icon + '44' }]}>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onSkip} />
        <ThemedText style={styles.title}>Crop</ThemedText>
        <Button
          label={saving ? 'Saving…' : 'Save'}
          size="sm"
          onPress={onSave}
          disabled={saving || !crop}
        />
      </View>

      <ThemedText style={[styles.hint, { color: C.icon }]}>
        Drag the rectangle or its corners to select just the passage you want to
        practice.
      </ThemedText>

      <View style={styles.cropOuter}>
        <div
          ref={containerRef}
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
            src={piece.source_uri}
            alt=""
            onLoad={onImgLoad}
            crossOrigin="anonymous"
            draggable={false}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
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

      <View style={[styles.bottomBar, { borderTopColor: C.icon + '44' }]}>
        <Button label="Skip cropping" variant="outline" onPress={onSkip} fullWidth />
      </View>

      <PromptModal
        visible={namePromptVisible}
        title="Name this passage"
        message="Pick something specific so you recognize it in your practice log — like a measure number, section name, or a fun label. Keep it positive!"
        placeholder="e.g. mm. 32-40, Coda, The Tricky Run"
        submitLabel="Save"
        onSubmit={handleName}
        onCancel={() => handleName('')}
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
  cropOuter: {
    flex: 1,
    overflow: 'hidden',
  },
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderTopWidth: Borders.thin,
  },
  errorWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  errorText: { color: '#c0392b', fontSize: Type.size.sm, textAlign: 'center' },
});
