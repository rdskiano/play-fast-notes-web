import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Borders, Radii, Status, Type } from '@/constants/tokens';
import type { Marker } from '@/lib/db/repos/pieces';

type Props = {
  uri: string;
  markers: Marker[];
  mode: 'place' | 'play';
  activePair?: [number, number] | null;
  onTap?: (point: { x: number; y: number }) => void;
  onRemoveMarker?: (index: number) => void;
};

const MARKER_HIT_RADIUS = 24;

type DrawnRect = { w: number; h: number; ox: number; oy: number };

function computeDrawnRect(
  containerW: number,
  containerH: number,
  aspect: number | null,
): DrawnRect {
  if (!aspect || !containerW || !containerH) {
    return { w: containerW, h: containerH, ox: 0, oy: 0 };
  }
  const containerAspect = containerW / containerH;
  if (aspect > containerAspect) {
    const w = containerW;
    const h = w / aspect;
    return { w, h, ox: 0, oy: (containerH - h) / 2 };
  }
  const h = containerH;
  const w = h * aspect;
  return { w, h, ox: (containerW - w) / 2, oy: 0 };
}

export function ScoreWithMarkers({
  uri,
  markers,
  mode,
  onTap,
  onRemoveMarker,
}: Props) {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<number | null>(null);

  const drawn = computeDrawnRect(containerSize.w, containerSize.h, aspect);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== containerSize.w || height !== containerSize.h) {
      setContainerSize({ w: width, h: height });
    }
  }

  function handleLoad(e: ImageLoadEventData) {
    const w = e.source?.width;
    const h = e.source?.height;
    if (w && h) setAspect(w / h);
  }

  function handleRelease(e: GestureResponderEvent) {
    if (mode !== 'place' || !onTap) return;
    const { locationX, locationY } = e.nativeEvent;
    if (drawn.w === 0 || drawn.h === 0) return;
    const lx = locationX - drawn.ox;
    const ly = locationY - drawn.oy;
    if (lx < 0 || ly < 0 || lx > drawn.w || ly > drawn.h) return;
    const x = lx / drawn.w;
    const y = ly / drawn.h;

    const hitIdx = nearestMarkerIndex(markers, x, y, drawn.w, drawn.h);
    if (hitIdx != null && onRemoveMarker) {
      onRemoveMarker(hitIdx);
      return;
    }
    onTap({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
  }

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      onStartShouldSetResponder={() => mode === 'place'}
      onResponderRelease={handleRelease}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        onLoad={handleLoad}
      />
      {markers.map((m) => {
        if (mode === 'play') {
          return (
            <ThemedText
              key={m.index}
              style={[
                styles.arrow,
                {
                  left: drawn.ox + m.x * drawn.w - 14,
                  top: drawn.oy + m.y * drawn.h - 34,
                  pointerEvents: 'none',
                },
              ]}>
              ▼
            </ThemedText>
          );
        }
        return (
          <View
            key={m.index}
            style={[
              styles.marker,
              {
                left: drawn.ox + m.x * drawn.w - 14,
                top: drawn.oy + m.y * drawn.h - 28,
                pointerEvents: 'none',
              },
            ]}>
            <ThemedText style={styles.markerText}>{m.index}</ThemedText>
          </View>
        );
      })}
    </View>
  );
}

function nearestMarkerIndex(
  markers: Marker[],
  x: number,
  y: number,
  w: number,
  h: number,
): number | null {
  let best: { idx: number; d2: number } | null = null;
  for (const m of markers) {
    const dx = (m.x - x) * w;
    const dy = (m.y - y) * h;
    const d2 = dx * dx + dy * dy;
    if (d2 < MARKER_HIT_RADIUS * MARKER_HIT_RADIUS) {
      if (best === null || d2 < best.d2) best = { idx: m.index, d2 };
    }
  }
  return best?.idx ?? null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0001',
    position: 'relative',
  },
  marker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: Radii.xl,
    borderWidth: Borders.thick,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Status.success,
    borderColor: '#145a32',
  },
  markerText: { color: '#fff', fontWeight: Type.weight.heavy, fontSize: 12 },
  arrow: {
    position: 'absolute',
    color: Status.success,
    fontSize: 28,
    fontWeight: Type.weight.black,
  },
});
