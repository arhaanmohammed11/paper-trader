import type { Article } from "./finnhub";

// Ranking headlines by how likely they are to move a stock.
//
// Finnhub returns 100-250 articles for a liquid name over a week, and most are
// noise: "which S&P500 stocks are most active on Tuesday", auto-generated
// screener output, and listicles. This scores what survives.
//
// No model is involved here — it is keyword and source heuristics, so it costs
// nothing and works without an API key.

/** Events that genuinely reprice a stock. Weighted by how much they usually move it. */
const CATALYSTS: { re: RegExp; weight: number; tag: string }[] = [
  { re: /\b(earnings|q[1-4] results|quarterly results|beats?|misses?|EPS)\b/i, weight: 100, tag: "Earnings" },
  { re: /\b(guidance|outlook|forecast|raises?|lowers?|cuts? (its )?(forecast|outlook))\b/i, weight: 95, tag: "Guidance" },
  { re: /\b(acquire|acquisition|merger|takeover|buyout|to buy|deal to)\b/i, weight: 90, tag: "M&A" },
  { re: /\b(upgrade[sd]?|downgrade[sd]?|price target|initiated coverage|overweight|underweight)\b/i, weight: 70, tag: "Analyst" },
  { re: /\b(FDA|clinical trial|phase [123]|approval|approved|recall)\b/i, weight: 85, tag: "Regulatory" },
  { re: /\b(lawsuit|sued?|settlement|investigation|probe|antitrust|SEC filing|fined?)\b/i, weight: 75, tag: "Legal" },
  { re: /\b(CEO|CFO|resign|steps? down|appoints?|named chief)\b/i, weight: 65, tag: "Leadership" },
  { re: /\b(layoffs?|job cuts|restructuring|plant closure)\b/i, weight: 65, tag: "Restructuring" },
  { re: /\b(dividend|buyback|share repurchase|split)\b/i, weight: 60, tag: "Capital" },
  { re: /\b(contract|partnership|deal with|wins? (a )?(bid|order)|supply agreement)\b/i, weight: 55, tag: "Business" },
  { re: /\b(short seller|fraud|accounting|restat(e|ing|ement))\b/i, weight: 90, tag: "Risk" },
  { re: /\b(tariff|sanction|export control|regulation|antitrust)\b/i, weight: 60, tag: "Policy" },
  { re: /\b(surge[sd]?|plunge[sd]?|soar|tumble|jump|sink|rall(y|ies)|selloff)\b/i, weight: 45, tag: "Move" },
];

/**
 * Auto-generated and promotional patterns. These dominate the raw feed and
 * carry no information about a specific company.
 */
const NOISE = [
  /\bwhich .* (stocks?|companies) are\b/i,
  /\b(most active|movers?|gainers?|losers?) (on|this|today)\b/i,
  /\b\d+ (reasons?|stocks?|things|ways|charts?)\b/i,
  /\bbest .* (stocks?|to buy)\b/i,
  /\b(should you buy|is it time to buy|worth buying)\b/i,
  /\b(zacks|chartmill) /i,
  /\bmarket (open|close|wrap|recap)\b/i,
  /\bdaily (roundup|digest|briefing)\b/i,
  /\bnoon report\b/i,
  /\bstocks? to watch\b/i,
];

/** Outlets whose company coverage tends to be reported, not generated. */
const QUALITY: Record<string, number> = {
  Reuters: 45,
  Bloomberg: 45,
  CNBC: 35,
  "The Wall Street Journal": 45,
  "Financial Times": 45,
  Barrons: 30,
  "Associated Press": 35,
  MarketWatch: 25,
  Forbes: 15,
  "Yahoo Finance": 15,
  Benzinga: 5,
  SeekingAlpha: 10,
  ChartMill: -40,
  Zacks: -25,
  "Simply Wall St": -20,
  InvestorPlace: -25,
  "Motley Fool": -20,
};

export type RankedArticle = Article & {
  score: number;
  tags: string[];
};

function hoursOld(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/** Rough headline similarity, to drop the same story rewritten by five outlets. */
function normalizeHeadline(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8)
    .sort()
    .join(" ");
}

export function rankArticles(
  articles: Article[],
  symbol: string,
  companyName: string,
  limit = 10,
): RankedArticle[] {
  const sym = symbol.toUpperCase();
  // "Apple Inc." -> "apple"; the legal suffix rarely appears in a headline.
  const company = companyName
    .replace(/\b(inc|corp|corporation|company|co|plc|ltd|holdings|group|the)\b\.?/gi, "")
    .trim()
    .toLowerCase();

  const scored: RankedArticle[] = articles.map((a) => {
    const text = `${a.headline} ${a.summary}`;
    let score = 0;
    const tags: string[] = [];

    // --- is this actually about this company? -----------------------------
    const mentionsTicker = a.related.includes(sym);
    const inHeadline =
      new RegExp(`\\b${sym}\\b`).test(a.headline) ||
      (company.length > 3 && a.headline.toLowerCase().includes(company));

    const inSummary =
      new RegExp(`\\b${sym}\\b`).test(a.summary) ||
      (company.length > 3 && a.summary.toLowerCase().includes(company));

    // RELEVANCE GATES THE CATALYST SCORE. Without this an Nvidia earnings story
    // merely tagged with TSLA outranked an actual Tesla recall, because the
    // catalyst keywords (Earnings 100 + Guidance 95) beat the on-topic bonus.
    // A catalyst only counts for the company the story is actually about.
    const relevance = inHeadline ? 1 : inSummary ? 0.35 : 0;
    if (relevance === 0) return { ...a, score: -1000, tags };

    if (inHeadline) score += 120;
    else score += 30;

    // A story tagged with many tickers is a market roundup, not company news.
    if (a.related.length > 8) score -= 60;
    else if (a.related.length <= 2 && mentionsTicker) score += 25;

    // --- is it a catalyst? -------------------------------------------------
    for (const c of CATALYSTS) {
      if (c.re.test(text)) {
        score += c.weight * relevance;
        // Only tag when the story is genuinely about this company, so the
        // Themes list reflects this stock rather than the whole sector.
        if (relevance >= 0.35 && !tags.includes(c.tag)) tags.push(c.tag);
      }
    }

    // --- is it generated noise? -------------------------------------------
    for (const n of NOISE) if (n.test(a.headline)) score -= 90;

    // --- who published it? -------------------------------------------------
    score += QUALITY[a.source] ?? 0;

    // --- how fresh? --------------------------------------------------------
    // Market-moving news decays fast: yesterday's beat is already priced in.
    const age = hoursOld(a.publishedAt);
    if (age < 6) score += 60;
    else if (age < 24) score += 40;
    else if (age < 72) score += 15;
    else if (age > 168) score -= 30;

    // A headline with no summary is usually a stub.
    if (a.summary.length < 40) score -= 15;

    return { ...a, score, tags: tags.slice(0, 2) };
  });

  // Drop near-duplicates, keeping the highest-scoring version of each story.
  const seen = new Map<string, RankedArticle>();
  for (const a of scored.sort((x, y) => y.score - x.score)) {
    const key = normalizeHeadline(a.headline);
    if (!seen.has(key)) seen.set(key, a);
  }

  return [...seen.values()]
    .filter((a) => a.score > 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------------------------------------------------------------- signal ----
//
// A read on what the ranked headlines collectively suggest.
//
// This is RULES, not a model: directional keywords weighted by each article's
// rank score and recency. It is transparent and free, and it is genuinely
// cruder than a model would be — it cannot read context, sarcasm, or a headline
// whose meaning depends on knowing what was already expected. The UI labels it
// as computed from headlines for that reason.

const POSITIVE =
  /\b(beat|beats|beating|raise[sd]?|raising|upgrade[sd]?|surge[sd]?|soar(s|ed)?|jump(s|ed)?|rall(y|ies|ied)|record|wins?|won|approval|approved|outperform|strong|growth|expand(s|ed|ing)?|buyback|boost(s|ed)?|top(s|ped) estimates)\b/i;

const NEGATIVE =
  /\b(miss(es|ed)?|cut(s)?|lower(s|ed)?|downgrade[sd]?|plunge[sd]?|tumble[sd]?|sink(s|ing)?|slump|selloff|fall(s|ing)?|drop(s|ped)?|lawsuit|sued?|probe|investigation|recall|fraud|layoffs?|resign(s|ed)?|halt(s|ed)?|warn(s|ed|ing)?|weak|decline|loss(es)?|delay(s|ed)?)\b/i;

export type NewsSignal = {
  stance: "bullish" | "bearish" | "mixed" | "quiet";
  /** -1 .. 1 */
  lean: number;
  catalysts: { tag: string; count: number }[];
  freshCount: number;
  totalConsidered: number;
  shownCount: number;
  note: string;
};

export function summarizeSignal(
  ranked: RankedArticle[],
  totalConsidered: number,
): NewsSignal {
  const catalystCounts = new Map<string, number>();
  let pos = 0;
  let neg = 0;
  let fresh = 0;

  for (const a of ranked) {
    // Ranked articles are already relevance-gated, so every one of these is
    // genuinely about the company in question.
    const text = `${a.headline} ${a.summary}`;
    const age = hoursOld(a.publishedAt);
    if (age < 24) fresh++;

    // Weight by how prominent the story is and how recent — a top-ranked
    // headline from an hour ago says more than a marginal one from Tuesday.
    const weight = (a.score / 200) * (age < 24 ? 1 : age < 72 ? 0.6 : 0.3);

    if (POSITIVE.test(text)) pos += weight;
    if (NEGATIVE.test(text)) neg += weight;

    for (const t of a.tags) {
      catalystCounts.set(t, (catalystCounts.get(t) ?? 0) + 1);
    }
  }

  const total = pos + neg;
  const lean = total > 0 ? (pos - neg) / total : 0;

  const catalysts = [...catalystCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  let stance: NewsSignal["stance"];
  if (ranked.length < 2 || total < 0.3) stance = "quiet";
  else if (lean > 0.3) stance = "bullish";
  else if (lean < -0.3) stance = "bearish";
  else stance = "mixed";

  const topCatalyst = catalysts[0]?.tag.toLowerCase();
  const note =
    stance === "quiet"
      ? "No clear catalyst in recent coverage — mostly routine reporting."
      : stance === "mixed"
        ? `Coverage cuts both ways${topCatalyst ? `, centred on ${topCatalyst}` : ""}. Direction is unclear from headlines alone.`
        : stance === "bullish"
          ? `Coverage leans positive${topCatalyst ? `, driven by ${topCatalyst}` : ""}.`
          : `Coverage leans negative${topCatalyst ? `, driven by ${topCatalyst}` : ""}.`;

  return {
    stance,
    lean: Number(lean.toFixed(2)),
    catalysts,
    freshCount: fresh,
    totalConsidered,
    shownCount: ranked.length,
    note,
  };
}
