import { NextResponse } from "next/server";

import { getQuotes } from "@/lib/market/cache";
import { normalizeSymbol } from "@/lib/market/provider";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin wrapper around execute_market_order.
 *
 * Its only real job is making sure `quote_cache` holds a fresh price before the
 * RPC reads it. The RPC takes no price parameter by design — see the migration
 * header — so this route can influence WHEN a trade happens but never at what
 * price.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "NOT_AUTHENTICATED", message: "Please sign in again." },
      { status: 401 },
    );
  }

  let body: { accountId?: string; symbol?: string; side?: string; qty?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_ORDER", message: "Malformed request." },
      { status: 400 },
    );
  }

  const symbol = normalizeSymbol(body.symbol ?? "");
  const side = body.side === "sell" ? "sell" : "buy";
  const qty = Number(body.qty);

  if (!symbol || !Number.isFinite(qty) || qty <= 0 || qty !== Math.trunc(qty)) {
    return NextResponse.json(
      { error: "INVALID_ORDER", message: "Enter a whole number of shares." },
      { status: 400 },
    );
  }
  if (!body.accountId) {
    return NextResponse.json(
      { error: "INVALID_ORDER", message: "No account given." },
      { status: 400 },
    );
  }

  // Warm the cache first so the RPC's staleness check passes. Failures here are
  // non-fatal: the RPC decides whether what's cached is good enough to fill on.
  await getQuotes([symbol]).catch(() => undefined);

  const { data, error } = await supabase.rpc("execute_market_order", {
    p_account_id: body.accountId,
    p_symbol: symbol,
    p_side: side,
    p_qty: qty,
  });

  if (error) {
    // `details` carries the machine-readable tag set by the function; `message`
    // is already written for a human to read.
    const tag = error.details ?? "TRADE_FAILED";
    const status =
      tag === "INSUFFICIENT_FUNDS" || tag === "INSUFFICIENT_SHARES"
        ? 422
        : tag === "STALE_QUOTE" || tag === "NO_QUOTE"
          ? 409
          : tag === "ACCOUNT_NOT_FOUND"
            ? 404
            : 400;

    return NextResponse.json(
      { error: tag, message: error.message || "Trade failed." },
      { status },
    );
  }

  return NextResponse.json({ ok: true, fill: data });
}
