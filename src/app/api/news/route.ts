import { NextResponse } from "next/server";

import { companyNews, marketNews, newsForSymbols } from "@/lib/news/finnhub";
import { rankArticles, summarizeSignal } from "@/lib/news/rank";
import { bucketBySector } from "@/lib/news/sectors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * tab=top      broad market news
 * tab=sectors  the same feed bucketed into sectors (one upstream call, not one per sector)
 * tab=mine     news for everything in your watchlists and favourites
 * tab=symbol   news for one ticker
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") ?? "top";

  try {
    if (tab === "symbol") {
      const symbol = (params.get("symbol") ?? "").toUpperCase();
      if (!symbol) {
        return NextResponse.json({ error: "NO_SYMBOL" }, { status: 400 });
      }

      const admin = createAdminClient();
      const { data: instrument } = await admin
        .from("instruments")
        .select("name")
        .eq("symbol", symbol)
        .maybeSingle();
      const companyName = instrument?.name || symbol;

      // Rank first, then summarise. The model only ever sees the ten headlines
      // the reader sees, so the overview cannot cite something off-screen.
      const raw = await companyNews(symbol, 14);
      const ranked = rankArticles(raw, symbol, companyName, 10);

      return NextResponse.json({
        articles: ranked,
        signal: summarizeSignal(ranked, raw.length),
      });
    }

    if (tab === "mine") {
      const { data: items } = await supabase
        .from("watchlist_items")
        .select("symbol, is_favourite")
        .order("is_favourite", { ascending: false });

      const symbols = [...new Set((items ?? []).map((i) => i.symbol))];
      if (symbols.length === 0) {
        return NextResponse.json({ articles: [], covered: [], skipped: [] });
      }

      const { articles, covered, skipped } = await newsForSymbols(symbols);
      return NextResponse.json({ articles, covered, skipped });
    }

    if (tab === "sectors") {
      const all = await marketNews();
      const buckets = bucketBySector(all).map((b) => ({
        id: b.sector.id,
        label: b.sector.label,
        articles: b.articles,
      }));
      return NextResponse.json({ sectors: buckets });
    }

    return NextResponse.json({ articles: (await marketNews()).slice(0, 30) });
  } catch (err) {
    return NextResponse.json(
      {
        error: "NEWS_UNAVAILABLE",
        message:
          err instanceof Error ? err.message : "Couldn't load news right now.",
      },
      { status: 503 },
    );
  }
}
