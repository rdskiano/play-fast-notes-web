import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';

type Props = {
  uri: string;
};

/**
 * Show a score image at its natural aspect ratio, scaled to fit the
 * container width. If the image's natural height is taller than the
 * available container height, wraps in a vertical ScrollView so the
 * user can pan. If it's shorter, the outer view collapses to the
 * image's height so whatever sits below hugs it directly.
 */
export function ScrollableScore({ uri }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<number | null>(null);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  }

  function handleLoad(e: ImageLoadEventData) {
    const w = e.source?.width;
    const h = e.source?.height;
    if (w && h && h > 0) setAspect(w / h);
  }

  const naturalHeight = aspect && size.w ? size.w / aspect : 0;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <ScrollView
        showsVerticalScrollIndicator
        contentContainerStyle={styles.scrollContent}>
        <Image
          source={{ uri }}
          style={{
            width: size.w || 300,
            height: naturalHeight || 200,
            backgroundColor: 'transparent',
          }}
          contentFit="contain"
          onLoad={handleLoad}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // flexGrow:1 + justifyContent:flex-end makes short content sit at the
  // bottom of the scroll area (pinned against whatever comes next in the
  // parent flex column). Tall content exceeds the flex-grown min height
  // and scrolls normally from the top.
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
});
