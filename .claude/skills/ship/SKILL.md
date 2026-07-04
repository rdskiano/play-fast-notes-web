---
name: ship
description: Verify, summarize, and deploy Play Fast Notes — typecheck + web export + responsive smoke pass, then (with Ralph's OK) push to live web and optionally OTA to iPad. Use when Ralph says "ship it", "push it", "deploy", or a finished change is ready to go live.
---

# Ship a Play Fast Notes change

Run these steps in order. Do not skip the ask in step 5 — pushing IS a production deploy.

## 1. Typecheck
```
node node_modules/typescript/bin/tsc --noEmit
```
Always this exact form — bare `npx tsc` sometimes fetches a prank package instead of the local compiler. If there are errors, fix them and re-run before continuing.

## 2. Web bundle
```
npx expo export -p web
```
Must complete without errors.

## 3. Responsive smoke pass (only if UI changed)
Start the preview server (`playfast-web`, port 8081 — or `v2-web`, 8082, for sandbox work) and screenshot each **changed** screen at:
- 375×812 (phone portrait) and 812×375 (phone landscape)
- 768×1024 (iPad)
- desktop

Look specifically for: content overflowing the screen, overlapping buttons, controls pushed off-screen, reserved empty space. These are the exact bugs Ralph keeps having to catch on his devices — catch them first. Fix and re-check before moving on.

## 4. Plain-language summary
Tell Ralph, in musician-friendly English: the problem → what changed → what he should look for when he checks it himself. Be honest about what was verified (typecheck, bundle, screenshots) vs. what only he can verify (logged-in flows, real-device audio/pencil/camera behavior) — and give him exact steps for his part.

## 5. Deploy web — ASK FIRST
Ask: "Ready to push to playfastnotes.com?" Only after a yes:
```
git add -A && git commit  (clear plain message)
git push web-origin-archive master
```
This push is the live deploy (Vercel auto-deploys master).

## 6. Offer the iPad OTA (JS-only changes)
If the change matters on iPad/iPhone native, offer:
```
npx eas-cli update --channel preview --message "<same summary>"
```
Free, no build. Remind Ralph: **close and relaunch the app twice** to pick it up. Only suggest a real EAS build if native code changed (new module, permissions, app.json native config) — his build quota is limited.
