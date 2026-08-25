import Link from "next/link";

import { formatMoney, formatPercent, formatQuantity, formatSignedMoney } from "@/lib/format";

export type PositionRow = {
  symbol: string;
  qty: number;
  avgCost: number;
  price: number | null;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number | null;
  realized: number;
};

export function PositionsTable({ rows }: { rows: PositionRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-black/15 p-8 text-center dark:border-white/20">
        <p className="text-sm font-medium">No positions yet</p>
        <p className="mt-1 text-sm text-black/50 dark:text-white/50">
          Search a ticker, open it, and place your first buy.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
      <div className="flex items-baseline justify-between border-b border-black/10 px-4 py-2.5 dark:border-white/15">
        <h2 className="text-sm font-medium">Positions</h2>
        <span className="text-xs text-black/40 dark:text-white/40">
          {rows.length} holding{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/45 dark:border-white/15 dark:text-white/45">
            <tr>
              <th className="px-4 py-2 font-medium">Symbol</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Avg cost</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">Value</th>
              <th className="px-4 py-2 text-right font-medium">Unrealized</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.07] dark:divide-white/10">
            {rows.map((r) => {
              const up = r.unrealized >= 0;
              return (
                <tr key={r.symbol}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/stock/${r.symbol}`}
                      className="font-mono font-medium hover:underline underline-offset-4"
                    >
                      {r.symbol}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatQuantity(r.qty)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-black/60 dark:text-white/60">
                    {formatMoney(r.avgCost)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {r.price === null ? "—" : formatMoney(r.price)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatMoney(r.marketValue)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                      up
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatSignedMoney(r.unrealized)}
                    {r.unrealizedPct !== null && (
                      <span className="ml-1.5 text-xs opacity-70">
                        {formatPercent(r.unrealizedPct)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
