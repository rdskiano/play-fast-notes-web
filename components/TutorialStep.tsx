// TutorialStep (native) — registers each screen's help content with the global
// HelpContext so the bottom-right ? button (HelpButton) can show it, and
// auto-opens the modal the first time a screen's trigger is true per app
// session. Brought to parity with the web sibling.
//
// The old native no-op rationale ("no persistent KV store for suppression
// flags") is obsolete: the current HelpContext dedupes auto-opens IN MEMORY per
// session (autoOpenedRef), so nothing needs to be persisted. Renders nothing —
// the modal itself is mounted globally by HelpProvider in _layout.tsx.
//
// Focus-gated registration (useFocusEffect) ensures a screen kept warm in the
// nav stack doesn't leak its help into the active slot; only the focused screen
// registers, and it cleans up on blur.

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { useHelpContext } from '@/components/HelpContext';

export type TutorialStepImage = {
  source: ImageSourcePropType;
  aspectRatio: number;
  caption?: string;
};

export function TutorialStep({
  id,
  visible,
  title,
  body,
  image,
}: {
  id: string;
  visible: boolean;
  title: string;
  body: string;
  image?: TutorialStepImage;
}) {
  const { register, openAuto } = useHelpContext();

  // Register this screen's help content while focused; cleanup on blur.
  useFocusEffect(
    useCallback(() => {
      return register({ id, title, body, image });
    }, [register, id, title, body, image]),
  );

  // Auto-open the modal the first time this step's trigger is true for the
  // current session (deduped by id in the context, so closing won't re-pop).
  useFocusEffect(
    useCallback(() => {
      if (visible) openAuto(id);
    }, [visible, id, openAuto]),
  );

  return null;
}
