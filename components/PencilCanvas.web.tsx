// Web is annotation-display only — drawing needs the Apple Pencil on iPad.
// Shows the saved flattened PNG over the score; the edit path is a no-op.

import { Image } from 'expo-image';
import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type PencilCanvasHandle = {
  export(): Promise<{ data: string; png: string }>;
  clear(): void;
};

export type PencilCanvasProps = {
  initialData?: string | null;
  imageUri?: string | null;
  editable: boolean;
  style?: StyleProp<ViewStyle>;
};

export const PencilCanvas = forwardRef<PencilCanvasHandle, PencilCanvasProps>(
  function PencilCanvas({ imageUri, style }, ref) {
    useImperativeHandle(ref, () => ({
      async export() {
        // Web cannot edit annotations.
        return { data: '', png: '' };
      },
      clear() {},
    }));

    if (!imageUri) return null;
    return (
      <View style={style} pointerEvents="none">
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
        />
      </View>
    );
  },
);
