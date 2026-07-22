// Web sibling of the generated abcjsSource.ts (native). On web the WebView
// HTML that inlines this string is never rendered — RhythmNotation's WebView
// resolves to null and AbcStaffView.web renders abcjs (bundled from the npm
// package) straight into the DOM. Empty here so the 492 KB inlined native
// copy stays out of the web bundle.
export const ABCJS_SOURCE: string = '';
