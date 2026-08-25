import { NextResponse } from "next/server";

import { getQuotes } from "@/lib/market/cache";
import { getMarketStatus } from "@/lib/market/hours";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel's free tier kills a function at 10s, so cap the fan-out. */
const MAX_SYMBOLS = 25;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const symbols = (new URL(request.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "NO_SYMBOLS" }, { status: 400 });
  }

  const { quotes, stale } = await getQuotes(symbols);

  if (quotes.length === 0) {
    // Nothing cached and nothing fetchable — say so plainly instead of
    // returning an empty array the UI would render as "no data".
    return NextResponse.json(
      { error: "MARKET_DATA_UNAVAILABLE" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { quotes, stale, marketStatus: getMarketStatus() },
    { headers: stale ? { "X-Data-Stale": "1" } : undefined },
  );
}
