import { NextResponse } from "next/server";

import { openCircuit, recordCredits } from "@/lib/market/budget";
import { getHistory, getStaleHistory } from "@/lib/market/historyCache";
import { normalizeSymbol } from "@/lib/market/provider";
import { MAX_BARS, barSeconds, intervalFor } from "@/lib/market/resolution";
import { RateLimitedError } from "@/lib/market/types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Serves chart history. Response shape is TradingView's own, so swapping the
// chart engine to TradingView later needs no change here:
//   { s: "ok", t: [...], o, h, l, c, v }  |  { s: "no_data" }  |  { s: "error" }
//
// All caching and request-coalescing lives in lib/market/historyCache.

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ s: "error", errmsg: "Please sign in again." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const symbol = normalizeSymbol(params.get("symbol") ?? "");
  const resolution = params.get("resolution") ?? "1D";
  const from = Number(params.get("from"));
  const to = Number(params.get("to"));

  if (!symbol) {
    return NextResponse.json({ s: "error", errmsg: "No symbol given." }, { status: 400 });
  }

  const interval = intervalFor(resolution);
  if (!interval) {
    return NextResponse.json(
      { s: "error", errmsg: `That interval isn't supported.` },
      { status: 400 },
    );
  }

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return NextResponse.json({ s: "error", errmsg: "Bad time window." }, { status: 400 });
  }

  const bar = barSeconds(resolution);

  // A window implying more than the provider returns in one response would be
  // silently truncated, which renders as a chart that just stops. Clamp it and
  // let the chart's own paging fetch the rest.
  const maxSpan = bar * MAX_BARS;
  const clampedFrom = to - from > maxSpan ? to - maxSpan : from;

  try {
    const { bars, spent } = await getHistory(symbol, interval, bar, clampedFrom, to);
    if (spent > 0) await recordCredits(spent);

    if (bars.length === 0) return NextResponse.json({ s: "no_data" });

    return NextResponse.json({
      s: "ok",
      t: bars.map((b) => Math.floor(new Date(b.time).getTime() / 1000)),
      o: bars.map((b) => b.open),
      h: bars.map((b) => b.high),
      l: bars.map((b) => b.low),
      c: bars.map((b) => b.close),
      v: bars.map((b) => b.volume ?? 0),
    });
  } catch (err) {
    // Rate limited: serve the stale window if we have one. A slightly old chart
    // beats an error banner, and the user asked for history, not live ticks.
    const stale = getStaleHistory(symbol, interval, bar, clampedFrom, to);
    if (err instanceof RateLimitedError) {
      await openCircuit(60);
      if (stale) {
        return NextResponse.json(
          {
            s: "ok",
            t: stale.map((b) => Math.floor(new Date(b.time).getTime() / 1000)),
            o: stale.map((b) => b.open),
            h: stale.map((b) => b.high),
            l: stale.map((b) => b.low),
            c: stale.map((b) => b.close),
            v: stale.map((b) => b.volume ?? 0),
          },
          { headers: { "X-Data-Stale": "1" } },
        );
      }
      return NextResponse.json({
        s: "error",
        errmsg: "Too many chart requests just now — give it a few seconds.",
      });
    }

    return NextResponse.json({
      s: "error",
      errmsg: "Couldn't load price history.",
    });
  }
}
