import { NextResponse } from "next/server";

import { normalizeSymbol } from "@/lib/market/provider";
import { SUPPORTED_RESOLUTIONS } from "@/lib/market/resolution";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Backs TradingView's datafeed `resolveSymbol`. The chart needs to know the
// session, timezone and price precision BEFORE it asks for any bars — get
// `session` or `timezone` wrong here and the chart renders bars into the wrong
// slots, or draws empty space where a session should be.

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const symbol = normalizeSymbol(
    new URL(request.url).searchParams.get("symbol") ?? "",
  );
  if (!symbol) {
    return NextResponse.json({ error: "NO_SYMBOL" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: instrument } = await admin
    .from("instruments")
    .select("symbol, name, exchange, currency, kind")
    .eq("symbol", symbol)
    .maybeSingle();

  if (!instrument) {
    return NextResponse.json({ error: "NOT_FOUND", symbol }, { status: 404 });
  }

  return NextResponse.json({
    ticker: instrument.symbol,
    name: instrument.symbol,
    description: instrument.name || instrument.symbol,
    type: instrument.kind === "ETF" ? "fund" : "stock",
    // Regular US equity session, in exchange time. TradingView reads this as
    // exchange-local, which is why `timezone` below must match the venue and
    // NOT the viewer's browser.
    session: "0930-1600",
    timezone: "America/New_York",
    exchange: instrument.exchange,
    listed_exchange: instrument.exchange,
    minmov: 1,
    pricescale: 100, // quote to 1/100 — i.e. cents
    has_intraday: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: SUPPORTED_RESOLUTIONS,
    volume_precision: 0,
    data_status: "delayed_streaming",
    currency_code: instrument.currency,
  });
}
