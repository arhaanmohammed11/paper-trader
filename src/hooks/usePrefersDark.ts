"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Reads the OS colour-scheme preference.
 *
 * useSyncExternalStore rather than useEffect + setState: a media query IS an
 * external store, and reading it via an effect causes a cascading render on
 * every mount (and trips react-hooks/set-state-in-effect). The server snapshot
 * is `false` so SSR and first client paint agree.
 */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
