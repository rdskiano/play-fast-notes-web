// Apple's official "Download on the App Store" badge, linking to the app's
// store page. Web only (native sibling renders nothing). Uses raw DOM
// elements — this is a .web.tsx file, same pattern as
// SectionMarkerCapturer.web.tsx — because the badge is an <img> hotlinked
// from Apple's marketing CDN (see constants/appStore.ts). If that image
// ever fails (offline PWA, Apple outage), it degrades to a plain text link
// so the surface never shows a broken-image icon.
import { useState } from 'react';

import { APP_STORE_BADGE_SRC, APP_STORE_URL } from '@/constants/appStore';

export function AppStoreBadge({ height = 40 }: { height?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Play Fast Notes on the App Store"
      style={{
        display: 'inline-block',
        lineHeight: 0,
        textDecoration: 'none',
      }}>
      {broken ? (
        <span
          style={{
            display: 'inline-block',
            lineHeight: 1.2,
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background: '#000',
            border: '1px solid #a6a6a6',
            borderRadius: 8,
            padding: '10px 16px',
          }}>
          Download on the App Store
        </span>
      ) : (
        <img
          src={APP_STORE_BADGE_SRC}
          alt="Download on the App Store"
          height={height}
          // 119.66407 x 40 is the badge SVG's intrinsic ratio.
          width={Math.round(height * (119.66407 / 40))}
          onError={() => setBroken(true)}
        />
      )}
    </a>
  );
}
