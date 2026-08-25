import "server-only";

import type { MarketDataProvider } from "./provider";
import {
  SymbolNotFoundError,
  type Candle,
  type InstrumentMatch,
  type Quote,
  type Range,
} from "./types";
import { rankMatches } from "./ranking";

// Deterministic fake market. Same symbol always yields the same base price and
// the same candle series, so a page refresh doesn't reshuffle the chart and you
// can eyeball whether a UI change actually changed anything.
//
// This is the default provider whenever MARKET_DATA_MOCK=1 or no API key is
// set. UI work runs against it so the 800 credits/day survive the CSS phase.

const UNIVERSE: InstrumentMatch[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", currency: "USD", kind: "Common Stock" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", currency: "USD", kind: "Common Stock" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", currency: "USD", kind: "Common Stock" },
  { symbol: "AMZN", name: "Amazon.com Inc", exchange: "NASDAQ", currency: "USD", kind: "Common Stock" },
  { symbol: "GOOGL", name: "Alphabet Inc Class A", exchange: "NASDAQ", currency: "USD", kind: "Common Stock" },
  { symbol: "META", name: "Meta Platforms Inc", exchange: "NASDAQ", currency: "USD", kind: "Common Stock" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ", currency: "USD", kind: "Common Stock" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSE Arca", currency: "USD", kind: "ETF" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", currency: "USD", kind: "ETF" },
  { symbol: "JPM", name: "JPMorgan Chase & Co", exchange: "NYSE", currency: "USD", kind: "Common Stock" },
  { symbol: "KO", name: "Coca-Cola Company", exchange: "NYSE", currency: "USD", kind: "Common Stock" },
  { symbol: "DIS", name: "Walt Disney Company", exchange: "NYSE", currency: "USD", kind: "Common Stock" },
];

/** Stable hash so a symbol maps to the same price every run. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function basePrice(symbol: string): number {
  return 20 + (hash(symbol) % 48000) / 100; // $20 – $500
}

/** TradingView interval -> milliseconds per bar, for the windowed history API. */
const INTERVAL_MS: Record<string, number> = {
  "1min": 60_000,
  "5min": 5 * 60_000,
  "15min": 15 * 60_000,
  "30min": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1day": 24 * 60 * 60_000,
  "1week": 7 * 24 * 60 * 60_000,
  "1month": 30 * 24 * 60 * 60_000,
};

const RANGE_BARS: Record<Range, { bars: number; stepMs: number }> = {
  "1D": { bars: 78, stepMs: 5 * 60_000 },
  "1W": { bars: 65, stepMs: 30 * 60_000 },
  "1M": { bars: 154, stepMs: 60 * 60_000 },
  "3M": { bars: 63, stepMs: 24 * 60 * 60_000 },
  "1Y": { bars: 252, stepMs: 24 * 60 * 60_000 },
  "5Y": { bars: 260, stepMs: 7 * 24 * 60 * 60_000 },
};

export class MockProvider implements MarketDataProvider {
  readonly name = "mock";

  async quotes(symbols: string[]): Promise<Quote[]> {
    return symbols.map((raw) => {
      const symbol = raw.toUpperCase();
      const base = basePrice(symbol);
      // Drift on a 30s bucket so prices visibly move without being random on
      // every render — two components mounting together see the same number.
      const bucket = Math.floor(Date.now() / 30_000);
      const drift = (rand(hash(symbol) + bucket) - 0.5) * base * 0.02;
      const price = Math.max(0.01, round(base + drift, 2));
      const prevClose = round(base * (0.98 + rand(hash(symbol)) * 0.04), 2);

      return {
        symbol,
        price,
        prevClose,
        dayOpen: round(prevClose * 1.001, 2),
        dayHigh: round(Math.max(price, prevClose) * 1.008, 2),
        dayLow: round(Math.min(price, prevClose) * 0.992, 2),
        volume: 1_000_000 + (hash(symbol) % 40_000_000),
        sourceTs: new Date().toISOString(),
      };
    });
  }

  async search(query: string): Promise<InstrumentMatch[]> {
    const q = query.trim().toUpperCase();
    if (q.length === 0) return [];
    const hits = UNIVERSE.filter(
      (i) => i.symbol.includes(q) || i.name.toUpperCase().includes(q),
    );
    return rankMatches(hits, query);
  }

  async history(
    symbol: string,
    interval: string,
    fromSec: number,
    toSec: number,
  ): Promise<Candle[]> {
    const stepMs = INTERVAL_MS[interval] ?? 60 * 60_000;
    const bars = Math.min(
      5000,
      Math.max(0, Math.floor(((toSec - fromSec) * 1000) / stepMs)),
    );
    return this.walk(symbol.toUpperCase(), bars, stepMs, toSec * 1000);
  }

  async candles(symbol: string, range: Range): Promise<Candle[]> {
    const sym = symbol.toUpperCase();
    if (!UNIVERSE.some((u) => u.symbol === sym) && sym.length > 6) {
      throw new SymbolNotFoundError(sym);
    }

    const { bars, stepMs } = RANGE_BARS[range];
    return this.walk(sym, bars, stepMs, Date.now());
  }

  /** Deterministic random walk with mild mean reversion — looks like a market
   *  rather than noise, and is identical on every reload so a UI change is the
   *  only thing that can alter what you see. */
  private walk(sym: string, bars: number, stepMs: number, endMs: number): Candle[] {
    const seed = hash(sym);
    const out: Candle[] = [];

    let price = basePrice(sym) * 0.85;
    const target = basePrice(sym);

    for (let i = 0; i < bars; i++) {
      const shock = (rand(seed + i * 7.13) - 0.5) * price * 0.02;
      const pull = (target - price) * 0.01;
      const open = price;
      price = Math.max(0.5, price + shock + pull);
      const close = round(price, 2);
      const spread = Math.abs(close - open) + close * 0.004;

      out.push({
        time: new Date(endMs - (bars - 1 - i) * stepMs).toISOString(),
        open: round(open, 2),
        high: round(Math.max(open, close) + spread * rand(seed + i), 2),
        low: round(Math.min(open, close) - spread * rand(seed + i * 3), 2),
        close,
        volume: Math.floor(500_000 + rand(seed + i * 11) * 5_000_000),
      });
    }

    return out;
  }
}

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}
