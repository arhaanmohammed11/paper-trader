import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSV export of the full trade ledger.
//
// CSV rather than .xlsx because it imports cleanly everywhere: Google Sheets
// via File > Import, and — since this URL is stable and authenticated by
// cookie — it can also be pulled live. Excel and Numbers open it directly.

/** RFC 4180 escaping. A company name containing a comma would otherwise shift
 *  every following column, silently corrupting the sheet. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  // RLS restricts this to the caller's own trades; no account filter needed.
  const { data: trades, error } = await supabase
    .from("trades")
    .select(
      "executed_at, symbol, side, qty, price, gross_amount, fee, cash_delta, realized_pnl, avg_cost_at_trade",
    )
    .order("executed_at", { ascending: true });

  if (error) return new Response(`Export failed: ${error.message}`, { status: 500 });

  const header = [
    "Date",
    "Time (UTC)",
    "Symbol",
    "Side",
    "Quantity",
    "Price",
    "Gross amount",
    "Fee",
    "Cash change",
    "Realized P&L",
    "Avg cost at trade",
  ];

  const rows = (trades ?? []).map((t) => {
    const d = new Date(t.executed_at);
    return [
      d.toISOString().slice(0, 10),
      d.toISOString().slice(11, 19),
      t.symbol,
      t.side,
      t.qty,
      t.price,
      t.gross_amount,
      t.fee,
      t.cash_delta,
      t.realized_pnl,
      t.avg_cost_at_trade,
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paper-trader-trades-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
