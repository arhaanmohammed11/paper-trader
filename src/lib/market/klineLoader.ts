"use client";

import type * as KLine from "klinecharts";

// One module-level promise for the library.
//
// This matters for correctness, not just speed. The chart is created in an
// effect, which means the effect's CLEANUP may run before the dynamic import
// resolves — React StrictMode does exactly that on every mount in development.
// If cleanup can't reach `dispose` synchronously, the first chart instance is
// never torn down and a second one initialises on the same DOM node. Two live
// charts on one element is what "it resets every two seconds and glitches"
// actually looks like.
//
// Caching the module means that after the first load, `loaded` is populated and
// cleanup can dispose immediately.

let modulePromise: Promise<typeof KLine> | null = null;
let loaded: typeof KLine | null = null;

export function loadKLine(): Promise<typeof KLine> {
  modulePromise ??= import("klinecharts").then((m) => {
    loaded = m;
    return m;
  });
  return modulePromise;
}

/** Synchronous access once loaded — used by effect cleanup. */
export function klineSync(): typeof KLine | null {
  return loaded;
}
