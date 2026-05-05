import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Borders, Opacity, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { cropToBlob, type Rect } from '@/lib/image/canvasCrop';

type Handle = 'move' | 'tl' | 'tr' | 'bl' | 'br';

const HANDLE_SIZE = 24;
const MIN_CROP = 40;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

type Props = {
  imageUrl: string;
  hint?: string;
  saveLabel?: string;
  cancelLabel?: string;
  onCrop: (blob: Blob, dimensions: { w: number; h: number }) => void;
  onCancel: () => void;
};

export function InlineCropper({
  imageUrl,
  hint = 'Drag the rectangle or its corners to select just the passage you want to practice.',
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  onCrop,
  onCancel,
}: Props) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];

  const [imgRect, setImgRect] = useState<Rect | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

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
    setImgRect({ x, y, w: dispW, h: dispH });
    setNaturalSize({ w: natW, h: natH });
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
    function onResize() {
      measureImg();
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureImg]);

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
        const next: Rect = { ...startCrop };

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

  async function onSave() {
    if (!crop || !imgRect || !naturalSize) return;
    setSaving(true);
    setError(null);
    try {
      const ratio = naturalSize.w / imgRect.w;
      const area: Rect = {
        x: crop.x * ratio,
        y: crop.y * ratio,
        w: crop.w * ratio,
        h: crop.h * ratio,
      };
      const blob = await cropToBlob(imageUrl, area);
      onCrop(blob, { w: Math.round(area.w), h: Math.round(area.h) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.topBar, { borderBottomColor: C.icon + '44' }]}>
        <Button label={cancelLabel} variant="ghost" size="sm" onPress={onCancel} />
        <ThemedText style={styles.title}>Crop</ThemedText>
        <Button
          label={saving ? 'Saving…' : saveLabel}
          size="sm"
          onPress={onSave}
          disabled={saving || !crop}
        />
      </View>

      <ThemedText style={[styles.hint, { color: C.icon }]}>{hint}</ThemedText>

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
            src={imageUrl}
            alt=""
            onLoad={measureImg}
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
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: 14,
    paddingBottom: Spacing.sm,
    borderBottomWidth: Borders.thin,
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
  cropOuter: { flex: 1, overflow: 'hidden' },
  errorWrap: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  errorText: { color: '#c0392b', fontSize: Type.size.sm, textAlign: 'center' },
});
