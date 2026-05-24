// Native (iOS): the iPad always has Apple Pencil capability, so the pencil
// tool is always available. The web sibling watches for `pointerType === 'pen'`
// events to decide on the fly.
export function usePenDetected(): boolean {
  return true;
}
