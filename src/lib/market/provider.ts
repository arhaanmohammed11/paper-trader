import "server-only";

import type { Candle, InstrumentMatch, Quote, Range } from "./types";

/**
 * Everything the app needs from a market-data vendor.
 *
 * Kept deliberately small so swapping vendors — or splitting quotes onto a
 * faster one while candles stay here — is one new file plus one line in the
 * factory below, not a refactor.
 */
export interface MarketDataProvider {
  readonly name: string;
  quotes(symbols: string[]): Promise<Quote[]>;
  search(query: string): Promise<InstrumentMatch[]>;
  candles(symbol: string, range: Range): Promise<Candle[]>;
  /**
   * Bars inside an explicit window. TradingView's datafeed pages backwards by
   * requesting successive [from, to] windows, so `candles()` (which takes a
   * fixed lookback) cannot serve it.
   */
  history(
    symbol: string,
    interval: string,
    fromSec: number,
    toSec: number,
  ): Promise<Candle[]>;
}

let cached: MarketDataProvider | null = null;

export async function getProvider(): Promise<MarketDataProvider> {
  if (cached) return cached;

  // Default to the mock unless a key is present AND mocking is off. React
  // StrictMode double-invokes effects and hot reload remounts constantly, so
  // an accidental live provider during UI work can burn 800 credits in an
  // afternoon. Failing safe means failing to the mock.
  const useMock =
    process.env.MARKET_DATA_MOCK === "1" || !process.env.MARKET_DATA_API_KEY;

  if (useMock) {
    const { MockProvider } = await import("./mock");
    cached = new MockProvider();
  } else {
    const { TwelveDataProvider } = await import("./twelvedata");
    cached = new TwelveDataProvider(process.env.MARKET_DATA_API_KEY!);
  }

  return cached;
}

/** Normalizes user input into the canonical uppercase form we store. */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
