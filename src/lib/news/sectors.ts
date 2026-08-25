import type { Article } from "./finnhub";

// Sector buckets.
//
// HONEST LIMITATION: Finnhub has no sector-news endpoint. Its categories are
// general / forex / crypto / merger, not GICS sectors. So rather than making a
// call per sector (which would be slow and burn the rate limit), this buckets
// the single ~100-story general feed two ways:
//
//   1. the article's `related` tickers intersect a sector's bellwethers, or
//   2. the headline/summary matches a sector keyword.
//
// That means a sector can legitimately show few or no stories on a quiet day.
// The UI says "nothing in the last batch" rather than pretending otherwise.

export type Sector = {
  id: string;
  label: string;
  tickers: string[];
  keywords: RegExp;
};

export const SECTORS: Sector[] = [
  {
    id: "tech",
    label: "Technology",
    tickers: ["AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "META", "AMD", "INTC", "AVGO", "ORCL", "CRM", "ADBE", "CSCO", "QCOM", "TXN", "MU", "PLTR", "SMH", "XLK"],
    keywords: /\b(chip|semiconductor|software|cloud|AI|artificial intelligence|data cent(er|re)|smartphone|tech)\b/i,
  },
  {
    id: "financials",
    label: "Financials",
    tickers: ["JPM", "BAC", "WFC", "GS", "MS", "C", "SCHW", "AXP", "V", "MA", "BLK", "XLF"],
    keywords: /\b(bank|lender|interest rate|federal reserve|fed|treasury yield|credit|mortgage|insurance)\b/i,
  },
  {
    id: "healthcare",
    label: "Healthcare",
    tickers: ["UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT", "AMGN", "CVS", "XLV"],
    keywords: /\b(drug|pharma|FDA|clinical trial|vaccine|biotech|health insur|hospital|therapy)\b/i,
  },
  {
    id: "energy",
    label: "Energy",
    tickers: ["XOM", "CVX", "COP", "SLB", "OXY", "XLE"],
    keywords: /\b(oil|crude|OPEC|natural gas|refin|barrel|drilling|pipeline|energy price)\b/i,
  },
  {
    id: "consumer",
    label: "Consumer",
    tickers: ["AMZN", "WMT", "COST", "HD", "LOW", "TGT", "NKE", "SBUX", "MCD", "KO", "PEP", "PG", "DIS", "XLY", "XLP"],
    keywords: /\b(retail|consumer|shopper|e-commerce|restaurant|apparel|grocery|holiday sales)\b/i,
  },
  {
    id: "industrials",
    label: "Industrials & Autos",
    tickers: ["BA", "CAT", "DE", "GE", "HON", "UPS", "FDX", "LMT", "RTX", "MMM", "F", "GM", "TSLA", "RIVN", "XLI"],
    keywords: /\b(airline|aerospace|manufactur|factory|freight|logistics|automaker|vehicle|EV sales|defen[cs]e)\b/i,
  },
  {
    id: "macro",
    label: "Economy & Markets",
    tickers: ["SPY", "QQQ", "DIA", "IWM", "TLT", "GLD"],
    keywords: /\b(inflation|CPI|GDP|jobs report|unemployment|recession|tariff|S&P 500|Nasdaq|Dow|market|stocks)\b/i,
  },
];

function matches(article: Article, sector: Sector): boolean {
  if (article.related.some((t) => sector.tickers.includes(t))) return true;
  return sector.keywords.test(`${article.headline} ${article.summary}`);
}

export function bucketBySector(
  articles: Article[],
): { sector: Sector; articles: Article[] }[] {
  return SECTORS.map((sector) => ({
    sector,
    articles: articles.filter((a) => matches(a, sector)).slice(0, 12),
  }));
}
