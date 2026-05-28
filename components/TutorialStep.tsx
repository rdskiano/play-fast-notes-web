// Native no-op sibling for the web tutorial-step modal.
//
// Tutorial coaching is aimed at first-time visitors, who land on the
// live web build at playfastnotes.com. Native has no persistent KV
// store wired up (see lib/supabase/sessionStore.ts), so suppression
// flags would have nowhere to live; rather than add AsyncStorage just
// for this, the native build skips the prompts entirely. The real
// implementation lives next door in TutorialStep.web.tsx.

import type { ImageSourcePropType } from 'react-native';

export type TutorialStepImage = {
  source: ImageSourcePropType;
  aspectRatio: number;
  caption?: string;
};

export function TutorialStep(_props: {
  id: string;
  visible: boolean;
  title: string;
  body: string;
  image?: TutorialStepImage;
}) {
  return null;
}
