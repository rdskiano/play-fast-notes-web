import { Image, type ImageLoadEventData } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Palette } from '@/constants/palette';
import { Borders, Spacing, Type } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN_RECT = 60;
const HANDLE = 36;

type CropViewProps = {
  imageUri: string;
  onCrop: (croppedUri: string) => void;
  onCancel: () => void;
  saving?: boolean;
  hint?: string;
};

export function CropView({ imageUri, onCrop, onCancel, saving, hint }: CropViewProps) {
  const scheme = useColorScheme() ?? 'light';
  const C = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [initialized, setInitialized] = useState(false);

  const rectX = useSharedValue(0);
  const rectY = useSharedValue(0);
  const rectW = useSharedValue(0);
  const rectH = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startW = useSharedValue(0);
  const startH = useSharedValue(0);
  const drawnOx = useSharedValue(0);
  const drawnOy = useSharedValue(0);
  const drawnW = useSharedValue(0);
  const drawnH = useSharedValue(0);

  useEffect(() => {
    if (!natural || !containerSize.w || !containerSize.h) return;
    const containerAspect = containerSize.w / containerSize.h;
    const imgAspect = natural.w / natural.h;
    let w = containerSize.w;
    let h = containerSize.h;
    let ox = 0;
    let oy = 0;
    if (imgAspect > containerAspect) {
      h = w / imgAspect;
      oy = (containerSize.h - h) / 2;
    } else {
      w = h * imgAspect;
      ox = (containerSize.w - w) / 2;
    }
    drawnOx.value = ox;
    drawnOy.value = oy;
    drawnW.value = w;
    drawnH.value = h;

    if (!initialized) {
      rectX.value = ox;
      rectY.value = oy;
      rectW.value = w;
      rectH.value = h;
      setInitialized(true);
    } else {
      rectX.value = Math.max(ox, Math.min(ox + w - MIN_RECT, rectX.value));
      rectY.value = Math.max(oy, Math.min(oy + h - MIN_RECT, rectY.value));
      rectW.value = Math.max(MIN_RECT, Math.min(ox + w - rectX.value, rectW.value));
      rectH.value = Math.max(MIN_RECT, Math.min(oy + h - rectY.value, rectH.value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, containerSize]);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== containerSize.w || height !== containerSize.h) {
      setContainerSize({ w: width, h: height });
    }
  }

  function handleLoad(e: ImageLoadEventData) {
    if (e.source?.width && e.source?.height) {
      setNatural({ w: e.source.width, h: e.source.height });
    }
  }

  const bodyPan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startX.value = rectX.value;
      startY.value = rectY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const maxX = drawnOx.value + drawnW.value - rectW.value;
      const maxY = drawnOy.value + drawnH.value - rectH.value;
      rectX.value = Math.max(drawnOx.value, Math.min(maxX, startX.value + e.translationX));
      rectY.value = Math.max(drawnOy.value, Math.min(maxY, startY.value + e.translationY));
    });

  const tlPan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startX.value = rectX.value;
      startY.value = rectY.value;
      startW.value = rectW.value;
      startH.value = rectH.value;
    })
    .onUpdate((e) => {
      'worklet';
      const maxMoveX = startW.value - MIN_RECT;
      const maxMoveY = startH.value - MIN_RECT;
      const minX = drawnOx.value;
      const minY = drawnOy.value;
      const dx = Math.max(minX - startX.value, Math.min(maxMoveX, e.translationX));
      const dy = Math.max(minY - startY.value, Math.min(maxMoveY, e.translationY));
      rectX.value = startX.value + dx;
      rectY.value = startY.value + dy;
      rectW.value = startW.value - dx;
      rectH.value = startH.value - dy;
    });

  const trPan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startY.value = rectY.value;
      startW.value = rectW.value;
      startH.value = rectH.value;
    })
    .onUpdate((e) => {
      'worklet';
      const maxRight = drawnOx.value + drawnW.value;
      const maxW = maxRight - rectX.value;
      const maxMoveY = startH.value - MIN_RECT;
      const minY = drawnOy.value;
      const dy = Math.max(minY - startY.value, Math.min(maxMoveY, e.translationY));
      rectY.value = startY.value + dy;
      rectH.value = startH.value - dy;
      rectW.value = Math.max(MIN_RECT, Math.min(maxW, startW.value + e.translationX));
    });

  const blPan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startX.value = rectX.value;
      startW.value = rectW.value;
      startH.value = rectH.value;
    })
    .onUpdate((e) => {
      'worklet';
      const maxBottom = drawnOy.value + drawnH.value;
      const maxH = maxBottom - rectY.value;
      const maxMoveX = startW.value - MIN_RECT;
      const minX = drawnOx.value;
      const dx = Math.max(minX - startX.value, Math.min(maxMoveX, e.translationX));
      rectX.value = startX.value + dx;
      rectW.value = startW.value - dx;
      rectH.value = Math.max(MIN_RECT, Math.min(maxH, startH.value + e.translationY));
    });

  const brPan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startW.value = rectW.value;
      startH.value = rectH.value;
    })
    .onUpdate((e) => {
      'worklet';
      const maxRight = drawnOx.value + drawnW.value;
      const maxBottom = drawnOy.value + drawnH.value;
      const maxW = maxRight - rectX.value;
      const maxH = maxBottom - rectY.value;
      rectW.value = Math.max(MIN_RECT, Math.min(maxW, startW.value + e.translationX));
      rectH.value = Math.max(MIN_RECT, Math.min(maxH, startH.value + e.translationY));
    });

  const rectStyle = useAnimatedStyle(() => ({
    left: rectX.value,
    top: rectY.value,
    width: rectW.value,
    height: rectH.value,
  }));

  const maskTop = useAnimatedStyle(() => ({ height: rectY.value }));
  const maskBottom = useAnimatedStyle(() => ({
    top: rectY.value + rectH.value,
  }));
  const maskLeft = useAnimatedStyle(() => ({
    top: rectY.value,
    height: rectH.value,
    width: rectX.value,
  }));
  const maskRight = useAnimatedStyle(() => ({
    top: rectY.value,
    height: rectH.value,
    left: rectX.value + rectW.value,
  }));

  async function doCrop(
    snap: { x: number; y: number; w: number; h: number },
    drawn: { ox: number; oy: number; w: number; h: number },
  ) {
    if (!natural) return;
    const ix = Math.max(0, Math.round(((snap.x - drawn.ox) / drawn.w) * natural.w));
    const iy = Math.max(0, Math.round(((snap.y - drawn.oy) / drawn.h) * natural.h));
    const iw = Math.max(1, Math.round((snap.w / drawn.w) * natural.w));
    const ih = Math.max(1, Math.round((snap.h / drawn.h) * natural.h));

    const cropped = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ crop: { originX: ix, originY: iy, width: iw, height: ih } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );
    onCrop(cropped.uri);
  }

  function saveCrop() {
    const snap = { x: rectX.value, y: rectY.value, w: rectW.value, h: rectH.value };
    const drawn = {
      ox: drawnOx.value,
      oy: drawnOy.value,
      w: drawnW.value,
      h: drawnH.value,
    };
    runOnJS(doCrop)(snap, drawn);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={onCancel} hitSlop={8} style={styles.topBtn}>
          <ThemedText style={{ color: C.tint, fontWeight: '700' }}>Cancel</ThemedText>
        </Pressable>
        {hint && (
          <ThemedText style={styles.hintText} numberOfLines={1}>
            {hint}
          </ThemedText>
        )}
        <Pressable
          onPress={saving ? undefined : saveCrop}
          disabled={saving}
          hitSlop={8}
          style={styles.topBtn}>
          <ThemedText style={{ color: C.tint, fontWeight: '700' }}>
            {saving ? 'Saving…' : 'Save'}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.stageOuter}>
        <View style={styles.stageInner} onLayout={handleLayout}>
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            onLoad={handleLoad}
          />
          <Animated.View style={[styles.mask, styles.maskTop, maskTop]} pointerEvents="none" />
          <Animated.View style={[styles.mask, styles.maskBottom, maskBottom]} pointerEvents="none" />
          <Animated.View style={[styles.mask, maskLeft]} pointerEvents="none" />
          <Animated.View style={[styles.mask, maskRight]} pointerEvents="none" />
          <Animated.View style={[styles.rect, rectStyle]}>
            <GestureDetector gesture={bodyPan}>
              <Animated.View style={StyleSheet.absoluteFill} />
            </GestureDetector>
            <GestureDetector gesture={tlPan}>
              <Animated.View style={[styles.handle, styles.handleTL]} />
            </GestureDetector>
            <GestureDetector gesture={trPan}>
              <Animated.View style={[styles.handle, styles.handleTR]} />
            </GestureDetector>
            <GestureDetector gesture={blPan}>
              <Animated.View style={[styles.handle, styles.handleBL]} />
            </GestureDetector>
            <GestureDetector gesture={brPan}>
              <Animated.View style={[styles.handle, styles.handleBR]} />
            </GestureDetector>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  topBtn: { paddingHorizontal: Spacing.sm },
  hintText: { color: '#ffffffaa', fontSize: Type.size.sm, flex: 1, textAlign: 'center', marginHorizontal: Spacing.sm },
  stageOuter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  stageInner: { width: '100%', height: '90%' },
  mask: { position: 'absolute', backgroundColor: '#00000099', left: 0, right: 0 },
  maskTop: { top: 0 },
  maskBottom: { bottom: 0 },
  rect: {
    position: 'absolute',
    borderWidth: Borders.thick,
    borderColor: Palette.success,
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    backgroundColor: Palette.success + 'aa',
    borderColor: '#fff',
    borderWidth: Borders.thick,
    borderRadius: HANDLE / 2,
  },
  handleTL: { left: -HANDLE / 2, top: -HANDLE / 2 },
  handleTR: { right: -HANDLE / 2, top: -HANDLE / 2 },
  handleBL: { left: -HANDLE / 2, bottom: -HANDLE / 2 },
  handleBR: { right: -HANDLE / 2, bottom: -HANDLE / 2 },
});
