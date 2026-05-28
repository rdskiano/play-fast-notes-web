// TutorialStep — thin shim that registers screen-specific help with
// the global HelpContext.
//
// What it does:
//   1. On focus, registers { id, title, body, image } with the
//      HelpContext so the global ? button knows what to show on this
//      screen.
//   2. When the parent's `visible` prop flips true (or `?tutorial=1`
//      / `?tutorial=<id>` is in the URL), requests an auto-open via
//      context. The context dedupes auto-opens per id per session, so
//      a closed modal won't re-pop on every navigation back.
//   3. Renders nothing — the modal itself is mounted globally by
//      <HelpProvider>.
//
// Focus-gated registration: uses useFocusEffect so registration only
// happens on the screen the user is actually on. Without this, a
// screen kept warm in the navigation stack (e.g. rhythm-list still
// mounted while rhythm-builder is in focus) leaks its registered
// help into the active slot — the ? button on rhythm-builder would
// show rhythm-list's content. With useFocusEffect, only the focused
// screen registers; everything else cleans up on blur.
//
// Migration note: this file used to own its own Modal + dismiss flag
// state. That moved into HelpModal / HelpContext so auto-fire and
// manual-open share one modal mount. The component's prop API didn't
// change, so every existing <TutorialStep> mount still works.

import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { useHelpContext } from '@/components/HelpContext';

export type TutorialStepImage = {
  source: ImageSourcePropType;
  // width / height — RN Image needs an explicit aspect ratio to size
  // itself when only width is set via `style={{ width: '100%' }}`.
  aspectRatio: number;
  caption?: string;
};

// QA override: append `?tutorial=1` to any URL to force every
// TutorialStep on the page open, bypassing the parent's `visible`
// gate (e.g. practiceLogCount === 0). `?tutorial=<id>` targets a
// single step. Real users won't stumble onto this — friend-test
// links don't carry the param.
function isPreviewMode(id: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = new URLSearchParams(window.location.search).get('tutorial');
    if (!v) return false;
    if (v === '1' || v === 'true') return true;
    return v === id;
  } catch {
    return false;
  }
}

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

  // Register this screen's help content while focused. The cleanup
  // returned by register() runs on blur (or when any dep changes),
  // ensuring stale registrations don't leak across navigations.
  useFocusEffect(
    useCallback(() => {
      return register({ id, title, body, image });
    }, [register, id, title, body, image]),
  );

  // Auto-open the modal the first time this step's trigger is true
  // for the current app session. Also gated on focus so background
  // screens can't trigger auto-opens while the user is looking
  // somewhere else. The context dedupes by id, so closing doesn't
  // trigger a re-pop on navigation.
  useFocusEffect(
    useCallback(() => {
      if (visible || isPreviewMode(id)) {
        openAuto(id);
      }
    }, [visible, id, openAuto]),
  );

  return null;
}
