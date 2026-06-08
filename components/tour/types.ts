// Guided-tour shared types + the control-tagging helper.
//
// A "tour" is an ordered list of steps; each step spotlights one control
// on the screen and shows a short card explaining it. The engine itself
// is web-only (see TourContext.web.tsx); on native these types are still
// importable but useScreenTour is a no-op (TourContext.tsx) so the same
// shared screen code compiles and runs on iPad without a tour.

import { Platform, type ImageSourcePropType } from 'react-native';

export type TourStep = {
  // Matches the `tour` data tag on the control to spotlight — see tourTag.
  // If no control with this tag is on screen (e.g. it's hidden in the
  // current mode), the engine quietly skips the step.
  target: string;
  title: string;
  body: string;
  // When true, this step is part of the first-run walkthrough but gets no
  // persistent ⓘ dot afterward (for self-explanatory controls).
  hideDot?: boolean;
  // Which top corner the ⓘ dot sits on. Default 'right'; use 'left' for
  // wide controls where a right-corner dot floats far from the action.
  dotAnchor?: 'left' | 'right';
  // Fine-tune the ⓘ dot position (px) relative to its default top-corner
  // placement. Negative y lifts it higher; controls with taller/rounded
  // top edges sometimes need a touch more clearance.
  dotOffset?: { x?: number; y?: number };
  // Optional illustration shown in the step card — e.g. an example of a
  // marked-up score for a hard-to-describe interaction. aspectRatio =
  // width / height of the asset (RN-Web Image needs it to size correctly).
  image?: { source: ImageSourcePropType; aspectRatio: number; caption?: string };
};

// Tag a control as a tour stop. Spread onto any RN View / Pressable:
//
//   <View {...tourTag('tl-mode')}>…</View>
//
// On web this becomes a `data-tour="tl-mode"` DOM attribute that the
// overlay queries with document.querySelector. On native it returns an
// empty object, so the same line is a harmless no-op on iPad.
export function tourTag(id: string): { dataSet?: { tour: string } } {
  return Platform.OS === 'web' ? { dataSet: { tour: id } } : {};
}
