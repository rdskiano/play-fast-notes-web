// TopLayer (native) — passthrough. The web sibling (TopLayer.web.tsx) portals
// children to document.body to escape per-screen stacking contexts; native has
// no such need here (the docked panel uses <Modal>), so this just renders
// children in place to keep one shared API.

import type { ReactNode } from 'react';

export function TopLayer({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
