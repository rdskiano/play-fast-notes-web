// Native no-op sibling of PinchZoomPan.web.tsx.
//
// On iOS the document viewer already has pinch-zoom via ZoomableImage (idle
// reading) and native gesture-handler draw/resize components, so the web-only
// two-finger-zoom-while-marking wrapper isn't needed here. This stub keeps the
// unconditional import in app/document/[id].tsx resolving on native — it just
// renders its children untouched.

import { type ReactNode } from 'react';

type Props = {
  enabled?: boolean;
  maxScale?: number;
  resetSignal?: number;
  onScaleChange?: (scale: number) => void;
  onPinchingChange?: (pinching: boolean) => void;
  children: ReactNode;
};

export function PinchZoomPan({ children }: Props) {
  return <>{children}</>;
}
