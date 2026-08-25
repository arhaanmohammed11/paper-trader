// Seeds `instruments` with the US equity + ETF universe.
//
// Why this exists: Twelve Data's /symbol_search matches tickers and only
// loosely matches names, so a partial query like "appl" returns Aptus Pharma
// and Appleseed Fund but never AAPL — "appl" simply isn't a prefix of "AAPL".
// No amount of re-ranking recovers a row the upstream never sent.
//
// With the universe seeded locally, the pg_trgm index on `instruments.name`
// answers "appl" -> Apple Inc instantly, for zero API credits. It also means
// most searches never touch the network at all, which is the single biggest
// saving available against an 800-credit daily budget.
//
// Run:  node scripts/seed-instruments.mjs
// Cost: a handful of credits, once. Re-runnable — it upserts.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const API_KEY = env.MARKET_DATA_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !API_KEY) {
  console.error("Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MARKET_DATA_API_KEY in .env.local");
  process.exit(1);
}

// /stocks covers equities only. ETFs live behind /etf — which is why an
// "NYSE Arca" query against /stocks returns zero rows even though SPY is real.
const EXCHANGES = ["NASDAQ", "NYSE", "BATS"];
const ETF_EXCHANGES = new Set(["NASDAQ", "NYSE", "CBOE", "NYSE Arca", "BATS"]);
const KEEP_TYPES = new Set([
  "Common Stock",
  "ETF",
  "American Depositary Receipt",
  "Depositary Receipt",
  "Exchange-Traded Note",
  "Trust",
  "REIT",
]);

/** Retries transient network failures — this pulls thousands of rows and a
 *  mid-stream ECONNRESET is normal, not exceptional. */
async function withRetry(label, fn, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      const wait = 400 * 2 ** (i - 1);
      console.warn(`
  ${label} failed (${err.message}); retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function fetchList(path, params) {
  const url = new URL(`https://api.twelvedata.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const body = await withRetry(path, async () => {
    const r = await fetch(url, { headers: { Authorization: `apikey ${API_KEY}` } });
    return r.json();
  });

  if (!Array.isArray(body.data)) {
    console.warn(`  ${path}: unexpected response — ${body.message ?? "no data"}`);
    return [];
  }
  return body.data;
}

async function upsert(rows) {
  await withRetry("upsert", async () => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/instruments?on_conflict=symbol`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return true;
  });
}

const bySymbol = new Map();

function add(r, fallbackExchange, defaultKind) {
  const symbol = String(r.symbol ?? "").toUpperCase();
  // The schema enforces `symbol = upper(symbol)`; skip anything that wouldn't
  // round-trip, plus obvious warrant/unit noise.
  if (!symbol || !/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) return false;
  if (bySymbol.has(symbol)) return false;

  bySymbol.set(symbol, {
    symbol,
    name: String(r.name ?? "").slice(0, 200),
    exchange: String(r.exchange ?? fallbackExchange),
    currency: String(r.currency ?? "USD").slice(0, 3),
    kind: String(r.type ?? defaultKind),
  });
  return true;
}

for (const exchange of EXCHANGES) {
  const rows = await fetchList("/stocks", { country: "United States", exchange });
  let kept = 0;
  for (const r of rows) {
    if (!KEEP_TYPES.has(String(r.type ?? ""))) continue;
    if (add(r, exchange, "Common Stock")) kept++;
  }
  console.log(`  ${exchange.padEnd(14)} ${String(rows.length).padStart(6)} returned, ${String(kept).padStart(5)} kept`);
}

// ETFs: SPY, QQQ and friends are the single most-searched instruments in a
// paper-trading app, and none of them appear in /stocks.
{
  const rows = await fetchList("/etf", { country: "United States" });
  let kept = 0;
  for (const r of rows) {
    if (!ETF_EXCHANGES.has(String(r.exchange ?? ""))) continue;
    if (add(r, "NYSE Arca", "ETF")) kept++;
  }
  console.log(`  ${"ETFs".padEnd(14)} ${String(rows.length).padStart(6)} returned, ${String(kept).padStart(5)} kept`);
}

const all = [...bySymbol.values()];
console.log(`\nupserting ${all.length} instruments…`);

const BATCH = 250;
for (let i = 0; i < all.length; i += BATCH) {
  await upsert(all.slice(i, i + BATCH));
  process.stdout.write(`\r  ${Math.min(i + BATCH, all.length)}/${all.length}`);
}

console.log("\ndone.");
