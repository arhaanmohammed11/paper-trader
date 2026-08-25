import "server-only";

import { getMarketStatus } from "./hours";
import { getProvider } from "./provider";
import type { Candle } from "./types";

// Caching + coalescing for chart history.
//
// Without this the chart is unusable: a chart asks for bars on every mount,
// every interval change and every scroll-back, and the free plan allows 8
// requests per MINUTE. Measured before this existed: 53 upstream calls in a few
// minutes of clicking, ending in a rate-limit circuit breaker.
//
// Two ideas do the work:
//
//  1. QUANTIZE THE WINDOW. Requests used `to = Date.now()`, so every call had a
//     unique key and no cache could ever hit — even an identical request one
//     second later missed. Rounding both ends to a bar boundary makes repeated
//     requests share a key.
//
//  2. COALESCE IN FLIGHT. Two components (or React StrictMode's double mount)
//     asking for the same window at the same moment should produce ONE upstream
//     call, not two.

type Entry = { at: number; bars: Candle[] };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Candle[]>>();

const MAX_ENTRIES = 200;

/** Round a unix-seconds timestamp down to a multiple of `step`. */
function quantize(sec: number, step: number): number {
  return Math.floor(sec / step) * step;
}

/**
 * How long a cached window stays usable.
 *
 * Only the most recent bar of an open session can still change; everything
 * behind it is immutable history. So the TTL tracks "could the newest bar still
 * move", not "how old is this data".
 */
function ttlMs(barSec: number): number {
  const status = getMarketStatus();
  if (status !== "open") {
    // Closed: the last bar is final. Hold it for an hour.
    return 60 * 60_000;
  }
  // Open: a bar can keep changing until its period elapses. Never poll faster
  // than half a bar, and never slower than 5 minutes.
  return Math.min(Math.max((barSec * 1000) / 2, 15_000), 5 * 60_000);
}

export type HistoryResult = {
  bars: Candle[];
  cached: boolean;
  /** Credits actually spent upstream — 0 on a cache hit. */
  spent: number;
};

export async function getHistory(
  symbol: string,
  interval: string,
  barSeconds: number,
  fromSec: number,
  toSec: number,
): Promise<HistoryResult> {
  // Quantizing to the bar size is what makes the cache reachable at all.
  const step = Math.max(barSeconds, 60);
  const qFrom = quantize(fromSec, step);
  const qTo = quantize(toSec, step);
  const key = `${symbol}|${interval}|${qFrom}|${qTo}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs(barSeconds)) {
    return { bars: hit.bars, cached: true, spent: 0 };
  }

  const pending = inflight.get(key);
  if (pending) {
    // Someone else is already fetching this exact window — wait on theirs.
    return { bars: await pending, cached: true, spent: 0 };
  }

  const provider = await getProvider();
  const promise = provider
    .history(symbol, interval, qFrom, qTo)
    .then((bars) => {
      cache.set(key, { at: Date.now(), bars });
      // Crude bound — this is a per-instance memory cache, not a database.
      if (cache.size > MAX_ENTRIES) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest) cache.delete(oldest[0]);
      }
      return bars;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);

  const bars = await promise;
  return { bars, cached: false, spent: provider.name === "mock" ? 0 : 1 };
}

/** Serve a stale cached window when upstream refuses — better than an error. */
export function getStaleHistory(
  symbol: string,
  interval: string,
  barSeconds: number,
  fromSec: number,
  toSec: number,
): Candle[] | null {
  const step = Math.max(barSeconds, 60);
  const key = `${symbol}|${interval}|${quantize(fromSec, step)}|${quantize(toSec, step)}`;
  return cache.get(key)?.bars ?? null;
}
