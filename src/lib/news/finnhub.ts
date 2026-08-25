import "server-only";

// News via Finnhub. Twelve Data has no news endpoint at all (404 on every
// variant), so this is a second provider used ONLY for news — quotes, candles
// and search stay on Twelve Data.
//
// Free tier is 60 calls/minute, far more generous than Twelve Data's 8. Even
// so, everything here is cached: news changes on the order of minutes, and a
// dashboard that refetches on every navigation is pure waste.

export type Article = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string;
  related: string[];
};

const BASE = "https://finnhub.io/api/v1";
const TTL_MS = 5 * 60_000;

type Entry = { at: number; data: Article[] };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Article[]>>();

function key() {
  const k = process.env.NEWS_API_KEY;
  if (!k) {
    throw new Error(
      "Missing NEWS_API_KEY. Add your Finnhub key to .env.local and restart the dev server.",
    );
  }
  return k;
}

type RawArticle = {
  id?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  image?: string;
  datetime?: number;
  related?: string;
};

function normalize(raw: RawArticle[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];

  for (const a of raw) {
    if (!a.headline || !a.url) continue;
    // Finnhub repeats the same story across categories and symbols; dedupe on
    // the URL so a "My stocks" feed built from five symbols isn't five copies.
    if (seen.has(a.url)) continue;
    seen.add(a.url);

    out.push({
      id: String(a.id ?? a.url),
      headline: a.headline,
      summary: (a.summary ?? "").slice(0, 400),
      source: a.source ?? "",
      url: a.url,
      image: a.image || null,
      publishedAt: new Date((a.datetime ?? 0) * 1000).toISOString(),
      related: (a.related ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    });
  }

  return out.sort((x, y) => y.publishedAt.localeCompare(x.publishedAt));
}

async function fetchCached(cacheKey: string, url: string): Promise<Article[]> {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 429) throw new Error("News rate limit reached");
    if (!res.ok) throw new Error(`News request failed (${res.status})`);

    const body = await res.json();
    const data = normalize(Array.isArray(body) ? body : []);
    cache.set(cacheKey, { at: Date.now(), data });
    return data;
  })().finally(() => inflight.delete(cacheKey));

  inflight.set(cacheKey, promise);
  return promise;
}

/** Broad market news. One call returns ~100 stories across every sector. */
export async function marketNews(): Promise<Article[]> {
  return fetchCached(
    "market",
    `${BASE}/news?category=general&token=${key()}`,
  );
}

/** News for one symbol, over a trailing window. */
export async function companyNews(
  symbol: string,
  days = 7,
): Promise<Article[]> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const sym = symbol.toUpperCase();

  return fetchCached(
    `company:${sym}:${fmt(from)}:${fmt(to)}`,
    `${BASE}/company-news?symbol=${encodeURIComponent(sym)}&from=${fmt(from)}&to=${fmt(to)}&token=${key()}`,
  );
}

/**
 * News for a set of symbols, merged newest-first.
 *
 * Capped at 8 symbols per request: a long watchlist would otherwise fan out
 * into dozens of calls and blow the per-minute limit. The cap is reported back
 * so the UI can say so rather than silently showing a partial feed.
 */
export async function newsForSymbols(
  symbols: string[],
  limit = 8,
): Promise<{ articles: Article[]; covered: string[]; skipped: string[] }> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const covered = unique.slice(0, limit);
  const skipped = unique.slice(limit);

  const results = await Promise.allSettled(
    covered.map((s) => companyNews(s, 7)),
  );

  const merged: Article[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const a of r.value) {
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      merged.push(a);
    }
  }

  merged.sort((x, y) => y.publishedAt.localeCompare(x.publishedAt));
  return { articles: merged, covered, skipped };
}
