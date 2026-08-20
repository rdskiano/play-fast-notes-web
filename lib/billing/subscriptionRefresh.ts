// A one-line event bus for "the subscription row just changed — refetch".
// useSubscription() instances live on many mounted screens at once; after an
// in-app purchase (or restore) succeeds, every one of them needs to notice
// without waiting for an auth-state change or a remount. The purchase flow
// calls bumpSubscriptionRefresh(); each hook instance subscribes.

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeSubscriptionRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bumpSubscriptionRefresh(): void {
  for (const listener of listeners) listener();
}
