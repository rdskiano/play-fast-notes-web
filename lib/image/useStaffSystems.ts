// Reads a passage photo's lines of music once per photo and remembers the
// answer for the session. Null while reading, and for good when the photo
// can't be read — callers then keep the mark-only box geometry.

import { useEffect, useState } from 'react';

import { loadGrayPixels } from '@/lib/image/grayPixels';
import { detectStaffSystems, type StaffSystem } from '@/lib/image/staffSystems';

// Wide enough for a whole page's staff lines to stay apart, small enough to
// decode quickly on the iPad.
const READ_WIDTH = 1200;
const MAX_CACHED = 40;

const cache = new Map<string, Promise<StaffSystem[] | null>>();

function readSystems(uri: string): Promise<StaffSystem[] | null> {
  let p = cache.get(uri);
  if (!p) {
    p = loadGrayPixels(uri, READ_WIDTH)
      .then(({ gray, width, height }) => detectStaffSystems(gray, width, height))
      .catch((e) => {
        console.warn('[staffSystems] could not read photo', e);
        return null;
      });
    cache.set(uri, p);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

export function useStaffSystems(uri: string | null | undefined): StaffSystem[] | null {
  const [state, setState] = useState<{ uri: string; systems: StaffSystem[] | null } | null>(null);
  useEffect(() => {
    if (!uri) return;
    let live = true;
    readSystems(uri).then((systems) => {
      if (live) setState({ uri, systems });
    });
    return () => {
      live = false;
    };
  }, [uri]);
  return state && state.uri === uri ? state.systems : null;
}
