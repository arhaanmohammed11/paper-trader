"use client";

import { useCallback, useSyncExternalStore } from "react";

// Custom event so a write in one component updates every reader in the same
// tab. The native `storage` event only fires in OTHER tabs, which is a classic
// source of "why didn't my toggle update the other panel".
const CHANGED = "pt:stored-choice";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A small persisted preference, read via useSyncExternalStore.
 *
 * localStorage IS an external store, so reading it with useEffect + setState
 * causes a cascading render on every mount (and trips
 * react-hooks/set-state-in-effect). The server snapshot is the fallback, which
 * keeps SSR and the first client paint in agreement.
 */
export function useStoredChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const getSnapshot = useCallback(() => {
    const raw = window.localStorage.getItem(key);
    return raw !== null && (allowed as readonly string[]).includes(raw)
      ? (raw as T)
      : fallback;
  }, [key, allowed, fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);

  const set = useCallback(
    (next: T) => {
      window.localStorage.setItem(key, next);
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );

  return [value, set];
}
