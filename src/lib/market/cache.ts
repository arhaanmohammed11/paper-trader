import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { isCircuitOpen, openCircuit, recordCredits } from "./budget";
import { quoteTtlMs } from "./hours";
import { getProvider, normalizeSymbol } from "./provider";
import { RateLimitedError, type CachedQuote, type InstrumentMatch } from "./types";

// Postgres `quote_cache` is the real cache, for two reasons that both matter:
//
//  1. Vercel serverless instances don't share memory, so an in-process Map is
//     per-lambda and mostly useless. Postgres is the only cache every instance
//     sees — five browser tabs cost the same as one.
//  2. It is already required as the trade RPC's price source. `execute_market_order`
//     reads its price from here rather than accepting one from the client, which
//     is what stops a caller from dictating the price they trade at. Caching is
//     the second job, not the first.

/** US-tradeable venues. Foreign cross-listings are not tradeable here and only
 *  pollute search — "appl" otherwise surfaces Aptus Pharma on the BSE. */
const US_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
  "NYSE American",
  "NYSE Arca",
  "CBOE",
  "BATS",
  "IEX",
  "OTC",
]);

/**
 * Records instruments we have real metadata for (from a search response).
 * Overwrites, because this data is better than whatever was there.
 */
export async function registerInstruments(
  matches: InstrumentMatch[],
): Promise<void> {
  const usable = matches.filter(
    (m) =>
      US_EXCHANGES.has(m.exchange) &&
      (!m.country || m.country === "United States"),
  );
  if (usable.length === 0) return;

  const admin = createAdminClient();
  await admin.from("instruments").upsert(
    usable.map((m) => ({
      symbol: m.symbol,
      name: m.name,
      exchange: m.exchange,
      currency: m.currency,
      kind: m.kind,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "symbol" },
  );
}

/**
 * Placeholder rows so `quote_cache` can satisfy its FK for a symbol reached by
 * URL that was never searched for.
 *
 * `ignoreDuplicates` is load-bearing: these rows carry an EMPTY name and
 * exchange, so a plain upsert would blank out real metadata every time a
 * seeded symbol was quoted — silently degrading search the more the app is
 * used. Insert-if-missing only.
 */
async function ensurePlaceholders(symbols: string[]): Promise<void> {
  if (symbols.length === 0) return;
  const admin = createAdminClient();

  await admin.from("instruments").upsert(
    symbols.map((symbol) => ({
      symbol,
      name: "",
      exchange: "",
      currency: "USD",
      kind: "stock",
    })),
    { onConflict: "symbol", ignoreDuplicates: true },
  );
}

export type QuoteResult = {
  quotes: CachedQuote[];
  /** True when at least one quote is older than its TTL and we couldn't refresh. */
  stale: boolean;
};

/**
 * Read-through cache: return everything asked for, refreshing only what has
 * gone stale, in a single batched upstream call.
 */
export async function getQuotes(rawSymbols: string[]): Promise<QuoteResult> {
  const symbols = [...new Set(rawSymbols.map(normalizeSymbol))].filter(Boolean);
  if (symbols.length === 0) return { quotes: [], stale: false };

  const admin = createAdminClient();
  const ttl = quoteTtlMs();
  const now = Date.now();

  const { data: rows } = await admin
    .from("quote_cache")
    .select("*")
    .in("symbol", symbols);

  const cached = new Map((rows ?? []).map((r) => [r.symbol, r]));

  const missing = symbols.filter((s) => {
    const row = cached.get(s);
    if (!row) return true;
    return now - new Date(row.fetched_at).getTime() > ttl;
  });

  let stale = false;

  if (missing.length > 0) {
    if (await isCircuitOpen()) {
      // Breaker open: serve what we have rather than hammering a rate limiter.
      stale = true;
    } else {
      try {
        const provider = await getProvider();
        const fresh = await provider.quotes(missing);

        if (fresh.length > 0) {
          // quote_cache has an FK to instruments, and a symbol reached by URL
          // may never have been searched for.
          await ensurePlaceholders(fresh.map((q) => q.symbol));

          const fetchedAt = new Date().toISOString();
          const upserts = fresh.map((q) => ({
            symbol: q.symbol,
            price: q.price,
            prev_close: q.prevClose,
            day_open: q.dayOpen,
            day_high: q.dayHigh,
            day_low: q.dayLow,
            volume: q.volume,
            source_ts: q.sourceTs,
            fetched_at: fetchedAt,
            is_stale: false,
          }));

          await admin.from("quote_cache").upsert(upserts, { onConflict: "symbol" });
          if (provider.name !== "mock") await recordCredits(missing.length);

          for (const u of upserts) cached.set(u.symbol, u as never);
        }

        // Symbols the provider had nothing for stay on their old cached value.
        if (fresh.length < missing.length) stale = true;
      } catch (err) {
        // Never throw out of the cache: a page that renders slightly old prices
        // beats a page that white-screens. The trade path checks freshness
        // separately and refuses to fill on a stale quote.
        if (err instanceof RateLimitedError) await openCircuit(60);
        stale = true;
      }
    }
  }

  const quotes: CachedQuote[] = [];
  for (const symbol of symbols) {
    const row = cached.get(symbol);
    if (!row) continue;
    const age = now - new Date(row.fetched_at).getTime();
    const isStale = age > ttl;
    if (isStale) stale = true;

    quotes.push({
      symbol: row.symbol,
      price: Number(row.price),
      prevClose: row.prev_close === null ? null : Number(row.prev_close),
      dayOpen: row.day_open === null ? null : Number(row.day_open),
      dayHigh: row.day_high === null ? null : Number(row.day_high),
      dayLow: row.day_low === null ? null : Number(row.day_low),
      volume: row.volume === null ? null : Number(row.volume),
      sourceTs: row.source_ts,
      fetchedAt: row.fetched_at,
      isStale,
    });
  }

  return { quotes, stale };
}
