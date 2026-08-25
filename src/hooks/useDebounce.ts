"use client";

import { useEffect, useState } from "react";

/**
 * Delays a rapidly-changing value. Used on the ticker search box: without it
 * every keystroke is a potential API call, and search is the fastest way to
 * burn a daily credit budget.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
