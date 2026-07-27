// Tracks whether an Apple Pencil annotation session is active anywhere in the
// app. The PencilKit tool palette is only visible while its canvas holds
// first-responder status, and the foot-pedal KeyCaptureView re-claims first
// responder on a 1-second timer — so while a pencil session is live, pedal
// capture must stand down entirely (PedalCatcher subscribes and unmounts).
// Set by useScoreAnnotation / useDocumentAnnotation; read by PedalCatcher.

let active = false;
const listeners = new Set<() => void>();

export function setPencilAnnotating(on: boolean) {
  if (active === on) return;
  active = on;
  listeners.forEach((l) => l());
}

export function isPencilAnnotating() {
  return active;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribePencilAnnotating(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
