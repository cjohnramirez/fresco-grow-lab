// Minimal external store for useSyncExternalStore. Module-level stores keep
// simulated and USB-device data alive while the user switches views, and let
// several hooks read the same stream without prop drilling.
export type ExternalStore<T> = {
  getSnapshot: () => T
  setState: (update: T | ((current: T) => T)) => void
  subscribe: (listener: () => void) => () => void
  listenerCount: () => number
}

export function createExternalStore<T>(
  initial: T,
  hooks: {
    onFirstSubscribe?: () => void
    onLastUnsubscribe?: () => void
  } = {}
): ExternalStore<T> {
  let state = initial
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => state,
    setState(update) {
      const next =
        typeof update === "function" ? (update as (current: T) => T)(state) : update
      if (Object.is(next, state)) {
        return
      }
      state = next
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) {
        hooks.onFirstSubscribe?.()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          hooks.onLastUnsubscribe?.()
        }
      }
    },
    listenerCount: () => listeners.size,
  }
}
