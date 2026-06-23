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

        {/* v2 redesign — brand fonts. Bricolage Grotesque (display) +
            Hanken Grotesk (body) give the app a modern ed-tech editorial
            feel. Loaded here so they're available app-wide; native falls
            back to system fonts. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />

        {/* Override expo-reset's `height: 100%` with `100dvh` (dynamic
            viewport height) so the layout tracks the actually-visible
            area on mobile browsers. Without this, on iOS Safari and
            Android Chrome the body sizes against the *large* viewport
            (URL bar retracted), and any content anchored to the bottom
            of the layout — practice tool tabs, miss/clean buttons,
            metronome — gets pushed under the browser's bottom toolbar.
            `dvh` resolves to whichever viewport the chrome is in right
            now, so the layout adapts as Safari shows/hides its bars.
            Source-order beats expo-reset; browsers that don't grok dvh
            (Safari < 15.4 / Chrome < 108) ignore the line and keep the
            100% fallback. */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html,body,#root{height:100dvh;}" +
              "body{font-family:'Hanken Grotesk',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#E4E0D6;}",
          }}
        />

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
