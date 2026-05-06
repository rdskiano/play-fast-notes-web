// Force light mode on web (mirrors the native hook in use-color-scheme.ts).
// The iPad design is light-mode-first and the dark variant has not been
// audited; respecting the system preference makes dark-mode phones render
// an unintended palette that looks broken. Return type stays
// 'light' | 'dark' so existing `scheme === 'dark'` branches still compile —
// they just become unreachable until we audit and re-enable dark.
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
