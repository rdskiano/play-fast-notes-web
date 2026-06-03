# Cluster 7: Clear the last three P0s

Bugs covered: **B-022**, **B-023**, **B-024** from `BUGS.md`. Three P0s in three different files. Killing them in one round closes out the launch-blocker tier — every remaining bug after this is P1 or P2 polish.

## Files to read before starting

- `components/PedalCatcher.web.tsx` — the keyboard catcher used by Tempo Ladder, Click-Up, and (after Cluster 4) Rhythmic Variation. Treats every arrow key as a pedal press, which is the root of B-022.
- `app/document/[id].tsx` — the PDF document viewer. The `SessionTopBar` `center` slot renders `doc.title` with `numberOfLines={1}` but no proper flex-shrink constraint, so a long title overflows into the buttons on the `right` slot. B-023 lives here.
- `app/(tabs)/library.tsx` — the library. Currently loads `listPassagesInFolder(currentFolderId)` + `listDocumentsInFolder(currentFolderId)` + `listFoldersInParent(currentFolderId)`, then filters that local set against the search query. So search only finds matches in the current folder. B-024 is the scope fix.
- `lib/db/repos/passages.ts` and `.web.ts` — confirm `listPassages()` (no-arg) returns all passages across folders.
- `lib/db/repos/documents.ts` and `.web.ts` — confirm `listDocuments()` returns all documents.

## What changes for users

**B-022 — Arrow keys stop hijacking practice screens.** Today every arrow key (Up/Down/Left/Right) is in the pedal-catcher's key set, so on a Tempo Ladder or Click-Up screen, tapping ArrowDown to scroll instead advances a rep. Most Bluetooth pedals can be configured to send Space / Enter / PageDown / PageUp; arrow keys are the source of the "strange results" because they're also what the browser uses for normal navigation. Fix: remove the four arrow keys from the catcher's FORWARD/BACK sets. Pedals that send PageDown/PageUp/Space/Enter continue to work; pedal users on arrow-only firmware reconfigure in their pedal's settings.

**B-023 — Long PDF titles truncate with an ellipsis instead of covering the right-side buttons.** Today `doc.title` is wrapped in a `<View style={{ alignItems: 'center', flex: 1 }}>` with `numberOfLines={1}` on the Text, but the inner text element doesn't have `minWidth: 0` or `flexShrink: 1` set explicitly. On RN-Web a Text with `numberOfLines={1}` inside a `flex: 1` parent still overflows if the parent doesn't have the magic `minWidth: 0` set. The title pushes past its allotted space, sliding under (and over) the icon buttons on the `right` slot. Fix: add the explicit shrink and `minWidth: 0` constraints so long titles ellipsize cleanly.

**B-024 — Library search returns matches from every folder, not just the current one.** Today the search filter runs against `passages` / `documents` / `folders` state, which is the result of `listPassagesInFolder(currentFolderId)` etc. — folder-scoped queries. Searching for a passage that lives two folders deep returns nothing. Fix: when the search query is non-empty, switch from the folder-scoped lists to global lists; show each match with its parent folder path so the user knows where it lives.

## Code-level changes

### `components/PedalCatcher.web.tsx`

Drop the four arrow keys from both sets. Replace:

```ts
const FORWARD_KEYS = new Set([
  'ArrowDown',
  'ArrowRight',
  'PageDown',
  ' ', // Space
  'Spacebar', // legacy
  'Enter',
]);
const BACK_KEYS = new Set([
  'ArrowUp',
  'ArrowLeft',
  'PageUp',
  'Backspace',
]);
```

with:

```ts
// Arrow keys removed 2026-06-03 (B-022): they were also browser navigation
// keys and caused "strange" practice-screen behaviour when users hit them
// expecting to scroll. Pedals that send arrows can be reconfigured to
// PageDown / PageUp / Space; the hint text shown on each practice screen
// never advertised arrows in the first place.
const FORWARD_KEYS = new Set([
  'PageDown',
  ' ', // Space
  'Spacebar', // legacy
  'Enter',
]);
const BACK_KEYS = new Set([
  'PageUp',
  'Backspace',
]);
```

The comment captures the reasoning so the next person who touches this file knows why arrows aren't there.

No other change needed — the catcher already gates on `secondaryKey` and `onBack`, and screens that bind X for Miss / Backspace for Back keep working.

### `app/document/[id].tsx`

Find the `center` slot in `SessionTopBar` (around line 776). Today:

```tsx
center={
  <View style={{ alignItems: 'center', flex: 1 }}>
    <ThemedText
      numberOfLines={1}
      style={[styles.title, isPhone && styles.titlePhone]}>
      {doc.title}
    </ThemedText>
    {doc.composer && !isPhone ? (
      <ThemedText style={styles.subtitle}>{doc.composer}</ThemedText>
    ) : null}
    {currentSection ? (
      // ...
    ) : null}
  </View>
}
```

Change the wrapping View and the title Text:

```tsx
center={
  <View style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
    <ThemedText
      numberOfLines={1}
      ellipsizeMode="tail"
      style={[styles.title, isPhone && styles.titlePhone, { maxWidth: '100%' }]}>
      {doc.title}
    </ThemedText>
    {doc.composer && !isPhone ? (
      <ThemedText
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.subtitle, { maxWidth: '100%' }]}>
        {doc.composer}
      </ThemedText>
    ) : null}
    {currentSection ? (
      // unchanged
    ) : null}
  </View>
}
```

Three changes:
- `minWidth: 0` on the wrapping View — the magic property that lets a flex child shrink below its content's natural width. Without it, the title's intrinsic width wins and overflows.
- `ellipsizeMode="tail"` on the title (and the composer) — guarantees the truncated text gets `...` instead of a hard clip.
- `maxWidth: '100%'` on each Text — RN-Web sometimes needs an explicit max so the truncation respects the parent.

### `app/(tabs)/library.tsx`

This is the biggest change. The library currently loads folder-scoped lists. We add a parallel "global mode" that kicks in when search is active.

**Add new state for global lists.** Near the existing state (around line 421):

```ts
const [allPassages, setAllPassages] = useState<Passage[]>([]);
const [allDocuments, setAllDocuments] = useState<Document[]>([]);
```

**Load the global lists once on mount, and refresh when the library data changes.** Find the existing `useEffect` that loads folder-scoped data (around line 440–478). Add a parallel fetch:

```ts
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const [globalPassages, globalDocuments] = await Promise.all([
        listPassages(),
        listDocuments(),
      ]);
      if (cancelled) return;
      setAllPassages(globalPassages);
      setAllDocuments(globalDocuments);
    } catch (e) {
      console.warn('[library] global load failed', e);
    }
  })();
  return () => { cancelled = true; };
}, [refreshKey]); // use whichever existing dep triggers a library refresh
```

If there's no `refreshKey` already, add `[currentFolderId]` so the global list re-fetches when the user navigates. Coarse but acceptable.

Import `listPassages` and `listDocuments` if not already imported:

```ts
import {
  listPassages,
  listPassagesInFolder,
  // ...
} from '@/lib/db/repos/passages';
import {
  listDocuments,
  listDocumentsInFolder,
  // ...
} from '@/lib/db/repos/documents';
```

Confirm those signatures exist by reading the repo files; if `listPassages` / `listDocuments` (no-arg) don't exist, add them — they should be a trivial wrapper that returns the full table.

**Switch the filter source based on whether search is active.** Replace the existing filter block (around line 492):

```ts
const q = searchQuery.trim().toLowerCase();
const filteredFolders = q
  ? folders.filter((f) => f.name.toLowerCase().includes(q))
  : folders;
const filteredPassages = q
  ? passages.filter(/* ... */)
  : passages;
const filteredDocuments = q
  ? documents.filter(/* ... */)
  : documents;
```

with:

```ts
const q = searchQuery.trim().toLowerCase();
// When searching, expand scope to the whole library. `allFolders` already
// holds every folder (loaded for the move-to-folder picker); allPassages
// and allDocuments are the new globals we fetch alongside.
const sourceFolders = q ? allFolders : folders;
const sourcePassages = q ? allPassages : passages;
const sourceDocuments = q ? allDocuments : documents;
const filteredFolders = q
  ? sourceFolders.filter((f) => f.name.toLowerCase().includes(q))
  : sourceFolders;
const filteredPassages = q
  ? sourcePassages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.composer ?? '').toLowerCase().includes(q),
    )
  : sourcePassages;
const filteredDocuments = q
  ? sourceDocuments.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.composer ?? '').toLowerCase().includes(q),
    )
  : sourceDocuments;
```

`allFolders` is already loaded via `listAllFolders()` on line 448 — reuse it. If the variable name differs, adjust.

**Show the parent folder path on search results.** A user seeing "Mozart Concerto" in search results across folders needs to know which folder it lives in. Build a folder-id-to-path map from `allFolders` and pass the parent folder name to each row.

Add a helper near the filter block:

```ts
const folderNameById = new Map<string, string>();
for (const f of allFolders) folderNameById.set(f.id, f.name);

function parentLabel(p: Passage | Document): string | null {
  if (!q) return null; // only show parent on search results
  const folderId = (p as Passage).folder_id ?? null;
  if (!folderId) return null;
  return folderNameById.get(folderId) ?? null;
}
```

Then in the row rendering — passages and documents have `folder_id` on them — pass `parentLabel(p)` down to the row component as a small `subtitle` or `breadcrumb` prop. If the existing row components (`FolderRow`, `PassageRow`, `DocumentRow`) don't accept a breadcrumb prop, add one and render it as a small italic line under the title:

```tsx
{breadcrumb && (
  <ThemedText style={[styles.breadcrumb, { color: C.icon }]}>
    in {breadcrumb}
  </ThemedText>
)}
```

with the style:

```ts
breadcrumb: {
  fontSize: 11,
  fontStyle: 'italic',
  marginTop: 2,
},
```

This is the most surface-area change in this cluster. If touching the row components feels too risky in one pass, the alternative is to prepend the breadcrumb to the title string at render time inside `library.tsx` — uglier but smaller blast radius. Terminal Claude can choose based on what's easiest to land cleanly.

**Documents inside a parent document.** Documents (PDFs) are themselves containers — their passages are nested under them. For search results that match a document, show the document title with no parent suggestion. For passages that match and have a `document_id`, prepend the parent document's title (preferred over folder name) — but only if it's easy. If not, skip this refinement; folder breadcrumb covers most cases.

## Test plan (run on `playweb` after Terminal Claude finishes)

**B-022 — arrows in practice screens**

1. Open any passage. Start Tempo Ladder. While the playing screen is up, tap ArrowDown. Nothing should happen — no Clean, no Miss, just the browser's default (which is usually nothing inside the app surface).
2. Tap Space — Clean fires as expected.
3. Tap X — Miss fires (the secondary binding from earlier work).
4. Tap PageDown — Clean fires. Tap PageUp — nothing on Tempo Ladder (no onBack), works as Back on Click-Up.
5. Open Click-Up. Tap ArrowUp — nothing. Tap Backspace — BACK fires.
6. **B-022 verified** when arrows do nothing on practice screens and pedal users on PageDown/Space/Enter pedals are unaffected.

**B-023 — long PDF title**

1. Upload a PDF and rename it to something long, e.g. "Symphony No. 9 in D Minor, Op. 125, Mvt. IV — Choral Finale (Beethoven)." Open it.
2. The title in the header should truncate with `...` and the right-side icon buttons (Mark / ⋯ / etc.) should be visible and tappable.
3. Resize the browser window narrower. The title shrinks further; buttons stay visible.
4. On phone width, same behaviour — the title gets aggressively truncated but never covers the ⋯ button.
5. **B-023 verified.**

**B-024 — library search scope**

1. Create two folders. Put a passage called "Mozart Test" inside Folder A. From Folder B, type "mozart" in the search bar at the top of the library.
2. The search result should include "Mozart Test" with a small "in Folder A" breadcrumb under the title.
3. Tap the result. It opens the passage normally.
4. Clear the search. The library returns to showing only Folder B's contents.
5. Search for a substring that matches both a folder name and a passage title — both show up in the results, with the passage showing its folder breadcrumb.
6. **B-024 verified.**

**Regression**

1. Sign out and sign in as a different account. The new account's search should only see its own passages, not the previous user's. (This is the listPassages RLS check — make sure the new global query respects user scoping.)
2. The library at root (no search) still works exactly as before.
3. Move a passage into a folder. Open that folder. The passage is there. Search for it from outside the folder. Result shows with the new breadcrumb.

Log any failures as new bugs. On full pass, mark B-022, B-023, B-024 ✅ on laptop-web, push, verify iphone-web + ipad-web on live, mark squashed in the bug logger.

## What stays unchanged

- The folder-scoped library load when search is empty — that's the normal browsing path and shouldn't change.
- The pedal catcher's `secondaryKey` behaviour (X = Miss on Tempo Ladder, etc.) and the typing-target protection.
- The 300 ms auto-repeat de-dupe.
- The PDF viewer's `pages.length` rendering, mark/draw flows, recordings, pencil annotations.
- The library's edit mode, move/reorder, delete confirm.
- All other strategy screens, the practice log, the Rep Rotator picker.

## After it ships

`tsc --noEmit`, `npx expo export -p web`, smoke locally, push, verify on three web surfaces, mark B-022 / B-023 / B-024 squashed.

After this, every P0 is dead. The remaining list:
- **B-001** (P1) — "Library Root" rename. Trivial.
- **B-002** (P1) — iPhone PWA scroll on Rhythmic Variation. Deferred to the iPhone-native UX pass.
- **B-006** (P2) — Empty recording guard not firing.
- **B-009** (P2) — Rep Rotator Clean/Miss off-center on phone.
- **B-011** (P2) — Metronome card too tall in Tempo Ladder.

That's a single final polish cluster — five small fixes — and then the launch readiness check itself.
