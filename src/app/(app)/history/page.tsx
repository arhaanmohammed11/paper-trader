import Link from "next/link";

import { formatMoney, formatQuantity, formatSignedMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Trade history · Paper Trader" };
export const dynamic = "force-dynamic";

type Trade = {
  id: string;
  executed_at: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  gross_amount: number;
  cash_delta: number;
  realized_pnl: number;
};

export default async function HistoryPage() {
  const supabase = await createClient();

  const { data: trades, error } = await supabase
    .from("trades")
    .select(
      "id, executed_at, symbol, side, qty, price, gross_amount, cash_delta, realized_pnl",
    )
    .order("executed_at", { ascending: false })
    .returns<Trade[]>();

  const totalRealized = (trades ?? []).reduce(
    (sum, t) => sum + Number(t.realized_pnl),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trade history</h1>
          <p className="text-sm text-black/55 dark:text-white/55">
            Every fill, oldest at the bottom. This ledger is append-only.
          </p>
        </div>
        {(trades?.length ?? 0) > 0 && (
          <a
            href="/api/trades/export"
            className="inline-flex h-9 items-center rounded-lg border border-black/15 px-3 text-sm
                       hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
          >
            ↓ Export CSV
          </a>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error.message}
        </p>
      )}

      {(trades?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-4 rounded-xl border border-black/10 p-4 dark:border-white/15">
          <Stat label="Trades" value={String(trades!.length)} />
          <Stat
            label="Realized P&L"
            value={formatSignedMoney(totalRealized)}
            tone={totalRealized >= 0 ? "up" : "down"}
          />
        </div>
      )}

      {!trades || trades.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 p-10 text-center dark:border-white/20">
          <p className="text-sm font-medium">No trades yet</p>
          <p className="mt-1 text-sm text-black/50 dark:text-white/50">
            Find a stock and place your first order.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/45 dark:border-white/15 dark:text-white/45">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Symbol</th>
                <th className="px-4 py-2.5 font-medium">Side</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Price</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 text-right font-medium">Realized</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.07] dark:divide-white/10">
              {trades.map((t) => {
                const realized = Number(t.realized_pnl);
                return (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-black/60 dark:text-white/60">
                      {new Date(t.executed_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/stock/${t.symbol}`}
                        className="font-mono font-medium hover:underline underline-offset-4"
                      >
                        {t.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          t.side === "buy"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {t.side}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatQuantity(t.qty)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatMoney(t.price)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatMoney(t.gross_amount)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        realized === 0
                          ? "text-black/30 dark:text-white/30"
                          : realized > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {realized === 0 ? "—" : formatSignedMoney(realized)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-black/45 dark:text-white/45">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono text-lg tabular-nums ${
          tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "down"
              ? "text-red-600 dark:text-red-400"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
