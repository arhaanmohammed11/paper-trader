// Shared shapes for the market-data layer. Provider-agnostic on purpose: these
// are what the app speaks, and each provider adapter translates into them.

export type Range = "1D" | "1W" | "1M" | "3M" | "1Y" | "5Y";

export const RANGES: Range[] = ["1D", "1W", "1M", "3M", "1Y", "5Y"];

export function isRange(value: string): value is Range {
  return (RANGES as string[]).includes(value);
}

export type Quote = {
  symbol: string;
  price: number;
  prevClose: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  /** Provider's timestamp for the price, not when we fetched it. */
  sourceTs: string | null;
};

/** A quote as served to the client, carrying its own freshness. */
export type CachedQuote = Quote & {
  fetchedAt: string;
  isStale: boolean;
};

export type Candle = {
  /** ISO timestamp. */
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type InstrumentMatch = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  kind: string;
  /** Used for ranking only — not persisted. Twelve Data returns the same
   *  ticker on a dozen foreign exchanges, and country separates them fastest. */
  country?: string;
};

/** Thrown when the provider rate-limits us, so callers can serve cache instead. */
export class RateLimitedError extends Error {
  constructor(message = "Market data provider rate limit reached") {
    super(message);
    this.name = "RateLimitedError";
  }
}

/** Thrown when the upstream is reachable but has nothing for that symbol. */
export class SymbolNotFoundError extends Error {
  constructor(symbol: string) {
    super(`No market data for symbol ${symbol}`);
    this.name = "SymbolNotFoundError";
  }
}
