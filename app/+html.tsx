// Custom HTML head for the web build. expo-router uses this file (when
// present) to wrap the default document — we extend it with PWA + iOS
// Add-to-Home-Screen metadata so phone users can pin Play Fast Notes
// to their home screen and run it full-screen, no browser chrome.

import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* `viewport-fit=cover` lets the standalone PWA paint into the
            iPhone notch / dynamic island area; otherwise the OS leaves
            black safe-area bars. `user-scalable=no` keeps a foot-pedal
            keystroke or accidental pinch from zooming the score during
            practice. Per-screen pinch-zoom (e.g. the rhythm builder's
            reference score) is implemented with a gesture wrapper, not
            the browser's native zoom. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
        />
        <ScrollViewStyleReset />

        {/* PWA manifest — gives Chrome / Edge / Firefox the Install App
            affordance and lets the standalone mode pick the right name,
            icon, and theme color. */}
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* iOS Safari ignores the manifest's standalone display mode and
            uses these legacy meta tags instead. `apple-mobile-web-app-
            capable` is what makes "Add to Home Screen" launch without
            the URL bar; `status-bar-style: black-translucent` gives the
            standalone window the same dark status bar the rest of the
            app's chrome already uses. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Play Fast" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon-precomposed.png" />

        <meta name="theme-color" content="#0a7ea4" />
      </head>
      <body>{children}</body>
    </html>
  );
}
