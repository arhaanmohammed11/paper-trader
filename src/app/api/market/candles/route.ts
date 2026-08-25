import { NextResponse } from "next/server";

import { canSpendNonEssential, recordCredits } from "@/lib/market/budget";
import { getProvider, normalizeSymbol } from "@/lib/market/provider";
import { isRange } from "@/lib/market/types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Historical bars are immutable once a session closes, so they cache hard.
// Revalidate windows are per-range: intraday moves, five-year weekly does not.
const REVALIDATE: Record<string, number> = {
  "1D": 300,
  "1W": 3600,
  "1M": 3600,
  "3M": 86400,
  "1Y": 86400,
  "5Y": 86400,
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const symbol = normalizeSymbol(params.get("symbol") ?? "");
  const range = params.get("range") ?? "1M";

  if (!symbol) {
    return NextResponse.json({ error: "NO_SYMBOL" }, { status: 400 });
  }
  if (!isRange(range)) {
    return NextResponse.json({ error: "BAD_RANGE" }, { status: 400 });
  }

  // Long-range charts are non-essential: shed them before the hard limit so the
  // credits left over go to quotes, which the trade path depends on.
  const essential = range === "1D" || range === "1W" || range === "1M";
  if (!essential && !(await canSpendNonEssential())) {
    return NextResponse.json({ error: "BUDGET_SHED" }, { status: 503 });
  }

  try {
    const provider = await getProvider();
    const candles = await provider.candles(symbol, range);
    if (provider.name !== "mock") await recordCredits(1);

    if (candles.length === 0) {
      return NextResponse.json({ error: "NO_DATA", symbol }, { status: 404 });
    }

    return NextResponse.json(
      { symbol, range, candles },
      {
        headers: {
          "Cache-Control": `private, max-age=${REVALIDATE[range]}`,
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "MARKET_DATA_UNAVAILABLE", symbol },
      { status: 503 },
    );
  }
}
