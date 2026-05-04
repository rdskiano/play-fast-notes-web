// Force light mode app-wide. The iPad design is light-mode-first and the
// dark variant has not been audited; respecting the system preference made
// dark-mode iPhones render an unintended palette. Return type stays
// 'light' | 'dark' so existing scheme === 'dark' branches still compile —
// they just become unreachable until we audit and re-enable dark.
export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}
