import "server-only";

import type { MarketDataProvider } from "./provider";
import { MAX_BARS } from "./resolution";
import { rankMatches } from "./ranking";
import {
  RateLimitedError,
  type Candle,
  type InstrumentMatch,
  type Quote,
  type Range,
} from "./types";

const BASE = "https://api.twelvedata.com";

/**
 * Range -> (interval, outputsize). A time_series call costs 1 credit no matter
 * how many bars come back, so outputsize is chosen for chart legibility rather
 * than thrift. Verified against the live API.
 */
const RANGE_SPEC: Record<Range, { interval: string; outputsize: number }> = {
  "1D": { interval: "5min", outputsize: 120 },
  "1W": { interval: "30min", outputsize: 120 },
  "1M": { interval: "1h", outputsize: 200 },
  "3M": { interval: "1day", outputsize: 95 },
  "1Y": { interval: "1day", outputsize: 370 },
  "5Y": { interval: "1week", outputsize: 270 },
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type Json = Record<string, unknown>;

export class TwelveDataProvider implements MarketDataProvider {
  readonly name = "twelvedata";

  constructor(private readonly apiKey: string) {}

  private async get(path: string, params: Record<string, string>) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const response = await fetch(url, {
      // The key travels in a header, never a query string, so it stays out of
      // logs and out of any URL that might get echoed back to a client.
      headers: { Authorization: `apikey ${this.apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000), // Vercel free tier kills at 10s.
    });

    if (response.status === 429) throw new RateLimitedError();
    if (!response.ok) {
      throw new Error(`Twelve Data ${path} failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as Json;

    // Errors also arrive as HTTP 200 with a `code` field — check the body too.
    const code = num(body.code);
    if (code === 429) throw new RateLimitedError(String(body.message ?? ""));
    if (code !== null && code >= 400) {
      throw new Error(String(body.message ?? `Twelve Data error ${code}`));
    }

    return body;
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];

    // Measured: one call carrying N symbols costs N credits but consumes only
    // ONE of the 8 requests/minute. Batching protects the rate limit, not the
    // daily quota — which is why the Postgres cache still matters.
    const body = await this.get("/quote", { symbol: symbols.join(",") });

    // One symbol returns a bare object; several return an object keyed by
    // symbol. A symbol that fails inside a batch gets its own error object
    // under its key, which we skip rather than failing the whole request.
    const entries: Json[] =
      symbols.length === 1 && typeof body.symbol === "string"
        ? [body]
        : Object.values(body).filter(
            (v): v is Json => typeof v === "object" && v !== null,
          );

    const quotes: Quote[] = [];
    for (const raw of entries) {
      const symbol = typeof raw.symbol === "string" ? raw.symbol : null;
      const price = num(raw.close);
      if (!symbol || price === null || price <= 0) continue;

      quotes.push({
        symbol: symbol.toUpperCase(),
        price,
        prevClose: num(raw.previous_close),
        dayOpen: num(raw.open),
        dayHigh: num(raw.high),
        dayLow: num(raw.low),
        volume: num(raw.volume),
        sourceTs: raw.timestamp
          ? new Date(Number(raw.timestamp) * 1000).toISOString()
          : null,
      });
    }

    return quotes;
  }

  async search(query: string): Promise<InstrumentMatch[]> {
    const body = await this.get("/symbol_search", {
      symbol: query,
      outputsize: "30",
    });

    const rows = Array.isArray(body.data) ? (body.data as Json[]) : [];

    const matches: InstrumentMatch[] = rows.map((r) => ({
      symbol: String(r.symbol ?? "").toUpperCase(),
      name: String(r.instrument_name ?? ""),
      exchange: String(r.exchange ?? ""),
      currency: String(r.currency ?? "USD").slice(0, 3),
      kind: String(r.instrument_type ?? "stock"),
      country: String(r.country ?? ""),
    }));

    return rankMatches(matches, query);
  }

  /** Bars inside an explicit [from, to] window — what the TradingView
   *  datafeed pages backwards over. Verified: works for daily and intraday,
   *  with intraday reaching at least 3 years back on the free plan. */
  async history(
    symbol: string,
    interval: string,
    fromSec: number,
    toSec: number,
  ): Promise<Candle[]> {
    const fmt = (sec: number) =>
      new Date(sec * 1000).toISOString().slice(0, 19).replace("T", " ");

    const body = await this.get("/time_series", {
      symbol,
      interval,
      start_date: fmt(fromSec),
      end_date: fmt(toSec),
      outputsize: String(MAX_BARS),
      order: "ASC",
      timezone: "UTC",
    });

    return parseValues(body);
  }

  async candles(symbol: string, range: Range): Promise<Candle[]> {
    const { interval, outputsize } = RANGE_SPEC[range];

    const body = await this.get("/time_series", {
      symbol,
      interval,
      outputsize: String(outputsize),
      order: "ASC", // charts want oldest-first; the API defaults to newest-first
      // Without this the API returns EXCHANGE-LOCAL time with no offset
      // ("2026-08-25 15:30:00"), which is unparseable without knowing the
      // venue's zone — and silently wrong by 4-5 hours if you assume UTC.
      timezone: "UTC",
    });

    return parseValues(body);
  }
}

/**
 * Shared bar parsing. Normalizes to explicit-UTC ISO so no downstream code has
 * to guess a timezone: daily and weekly bars come back date-only, intraday as
 * "YYYY-MM-DD HH:MM:SS", and both are UTC because every call sets timezone=UTC.
 */
function parseValues(body: Json): Candle[] {
  const values = Array.isArray(body.values) ? (body.values as Json[]) : [];
  const candles: Candle[] = [];

  for (const v of values) {
    const close = num(v.close);
    const open = num(v.open);
    const high = num(v.high);
    const low = num(v.low);
    const time = typeof v.datetime === "string" ? v.datetime : null;
    if (time === null || close === null || open === null) continue;

    candles.push({
      time: /^\d{4}-\d{2}-\d{2}$/.test(time)
        ? `${time}T00:00:00Z`
        : `${time.replace(" ", "T")}Z`,
      open,
      high: high ?? close,
      low: low ?? close,
      close,
      volume: num(v.volume),
    });
  }

  return candles;
}
