---
name: check
description: Quick mid-session build verification for Play Fast Notes — typecheck + web bundle, no deploy. Use when Ralph asks "does it still build?", after a batch of edits, or before suggesting anything is done.
---

# Quick build check

1. Typecheck (always this exact form — bare `npx tsc` is unreliable here):
```
node node_modules/typescript/bin/tsc --noEmit
```
2. Web bundle:
```
npx expo export -p web
```
3. Report in one plain sentence: clean, or what's broken. A passing check means "it compiles", NOT "it works" — never present this as proof the feature works.
