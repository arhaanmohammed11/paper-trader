import type { InstrumentMatch } from "./types";

// Local re-ranking of search results.
//
// Twelve Data's own ordering is unusable for a US paper-trading app: "appl"
// returns Aptus Pharma (BSE India) and Appleseed Fund; "coca" leads with a
// Brazilian listing. Verified against the live API.
//
// The weights below trade off against each other rather than acting
// independently, so if you change one, re-check the whole query set that they
// were tuned against: appl, apple, tsla, tesla, spy, coca, nvid, micro.

/** Exchanges we surface. Everything else is noise for a US paper-trader. */
const PREFERRED_EXCHANGES = new Set([
  "NASDAQ",
  "NYSE",
  "NYSE American",
  "NYSE Arca",
  "CBOE",
  "BATS",
  "IEX", // Twelve Data reports several NYSE names (e.g. KO) under IEX
  "OTC",
]);

/**
 * Leveraged / income / inverse products name their underlying, so they collide
 * with every popular-company search — "tesla" otherwise surfaces four Tesla
 * derivative ETFs above TSLA itself. Push them below the thing they track.
 */
const DERIVATIVE =
  /\b(\d(\.\d)?X|LEVERAGED?|WEEKLY|YIELDMAX|COVERED CALL|OPTION INCOME|BULL|BEAR|INVERSE|SHORT)\b/;

/**
 * A popularity prior. Without it the ranking has no way to know that "appl"
 * means Apple: AIT (Applied Industrial) and APP (AppLovin) name-prefix-match
 * "appl" exactly as well as AAPL does, and beat it on ticker length. Nothing
 * in the instrument metadata expresses "this is the one people mean".
 *
 * Real search engines resolve this with click/volume data we don't have. This
 * list is the honest stand-in: the most-traded US names and index ETFs. It is
 * a *tiebreaker*, not an allowlist — anything not listed still ranks normally,
 * and an exact ticker match still beats a popular name.
 *
 * Safe to extend. It is not load-bearing for correctness, only for ordering.
 */
const POPULAR = new Set([
  // mega-cap tech
  "AAPL", "MSFT", "NVDA", "GOOG", "GOOGL", "AMZN", "META", "TSLA", "AVGO",
  "AMD", "INTC", "NFLX", "ADBE", "CRM", "ORCL", "CSCO", "QCOM", "TXN", "MU",
  "PLTR", "UBER", "ABNB", "SHOP", "SQ", "PYPL", "SNAP", "COIN", "RBLX", "SPOT",
  // financials
  "BRK.A", "BRK.B", "JPM", "BAC", "WFC", "GS", "MS", "C", "SCHW", "AXP", "V",
  "MA", "BLK", "SPGI",
  // healthcare
  "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "AMGN", "CVS",
  // consumer & industrial
  "WMT", "COST", "HD", "LOW", "TGT", "NKE", "SBUX", "MCD", "KO", "PEP", "PG",
  "CL", "DIS", "CMCSA", "T", "VZ", "BA", "CAT", "DE", "GE", "HON", "UPS",
  "FDX", "LMT", "RTX", "MMM", "F", "GM", "RIVN", "LCID",
  // energy & materials
  "XOM", "CVX", "COP", "SLB", "OXY", "FCX", "NEM",
  // index & sector ETFs
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "VEA", "VWO", "AGG", "BND", "GLD",
  "SLV", "TLT", "HYG", "XLF", "XLE", "XLK", "XLV", "XLY", "XLP", "XLI", "XLU",
  "ARKK", "SOXX", "SMH", "EEM", "EFA", "IVV", "SCHD", "JEPI", "VIG", "VYM",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rankMatches(
  matches: InstrumentMatch[],
  query: string,
): InstrumentMatch[] {
  const q = query.trim().toUpperCase();
  if (q.length === 0) return [];

  const wordStart = new RegExp(`\\b${escapeRe(q)}`);

  const scored = matches
    .filter((m) => m.symbol.length > 0)
    .map((m) => {
      const name = m.name.toUpperCase();
      let score = 0;

      // --- what matched ---------------------------------------------------
      if (m.symbol === q) {
        score += 1000;
      } else if (m.symbol.startsWith(q)) {
        // Deliberately NOT far above a name-prefix match. "appl" prefix-matches
        // APPLX (Appleseed Fund) while only name-matching Apple Inc; scoring
        // ticker prefixes overwhelmingly buries AAPL under a mutual fund.
        score += 400 - (m.symbol.length - q.length) * 10;
      } else if (name.startsWith(q)) {
        score += 380;
      } else if (wordStart.test(name)) {
        score += 250; // start of any word: "coca" -> "The Coca-Cola Company"
      } else if (name.includes(q)) {
        score += 90;
      }

      // --- what kind of instrument it is -----------------------------------
      // Ordinary shares are what someone searching a company name almost
      // always wants, not a fund that merely holds it.
      if (m.kind === "Common Stock") score += 120;
      else if (m.kind === "ETF") score += 40;
      else if (m.kind.includes("Depositary")) score += 30;
      else if (m.kind === "Mutual Fund") score -= 100;

      if (DERIVATIVE.test(name)) score -= 220;

      // Short tickers skew toward primary, liquid listings.
      if (m.symbol.length <= 5) score += (6 - m.symbol.length) * 15;

      // Popularity prior — big enough to settle ties between equally good
      // textual matches, small enough that an exact ticker match still wins.
      if (POPULAR.has(m.symbol)) score += 200;

      // --- where it trades --------------------------------------------------
      // Country is the strongest single signal: the same ticker comes back on a
      // dozen foreign exchanges and only the US listing is tradeable here.
      if (m.country && m.country !== "United States") score -= 400;
      if (PREFERRED_EXCHANGES.has(m.exchange)) score += 300;
      if (m.exchange === "NASDAQ" || m.exchange === "NYSE") score += 60;
      if (m.exchange === "OTC") score -= 160;
      if (m.currency !== "USD") score -= 250;

      return { m, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.m.symbol.localeCompare(b.m.symbol));

  // Collapse cross-listings of the same ticker, keeping the best-ranked one.
  const seen = new Set<string>();
  const out: InstrumentMatch[] = [];
  for (const { m } of scored) {
    if (seen.has(m.symbol)) continue;
    seen.add(m.symbol);
    out.push(m);
    if (out.length === 10) break;
  }

  return out;
}
