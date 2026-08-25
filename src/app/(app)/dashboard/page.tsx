import { NewsPanel } from "@/components/news/NewsPanel";
import { TickerSearch } from "@/components/market/TickerSearch";
import {
  PositionsTable,
  type PositionRow,
} from "@/components/portfolio/PositionsTable";
import { WatchlistPanel } from "@/components/portfolio/WatchlistPanel";
import { getQuotes } from "@/lib/market/cache";
import { formatMoney, formatPercent, formatSignedMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard · Paper Trader" };
export const dynamic = "force-dynamic";

type Account = {
  id: string;
  name: string;
  cash: number;
  starting_cash: number;
  net_deposits: number;
  created_at: string;
};

type Position = {
  symbol: string;
  qty: number;
  avg_cost: number;
  realized_pnl: number;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account, error } = await supabase
    .rpc("get_or_create_account")
    .single<Account>();

  // RLS failures are SILENT — a blocked read returns null with error null,
  // identical to "nothing there". Render the error branch explicitly.
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm dark:border-red-900 dark:bg-red-950/40">
          <p className="font-medium text-red-800 dark:text-red-300">
            Couldn&apos;t load your account
          </p>
          <p className="mt-1 text-red-700 dark:text-red-400">{error.message}</p>
        </div>
      </div>
    );
  }

  const { data: positions } = await supabase
    .from("positions")
    .select("symbol, qty, avg_cost, realized_pnl")
    .gt("qty", 0)
    .order("symbol")
    .returns<Position[]>();

  // One batched quote call for every holding, through the read-through cache.
  const symbols = (positions ?? []).map((p) => p.symbol);
  const { quotes } = symbols.length ? await getQuotes(symbols) : { quotes: [] };
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  // Display-only arithmetic. Every persisted number was computed in SQL; live
  // unrealized P&L is the one exception the plan allows — rendered, never
  // written back.
  const rows: PositionRow[] = (positions ?? []).map((p) => {
    const qty = Number(p.qty);
    const avgCost = Number(p.avg_cost);
    const price = bySymbol.get(p.symbol)?.price ?? null;
    // A symbol with no cached quote falls back to cost basis, so it shows flat
    // rather than vanishing from your equity total.
    const mark = price ?? avgCost;
    const marketValue = qty * mark;
    const cost = qty * avgCost;
    return {
      symbol: p.symbol,
      qty,
      avgCost,
      price,
      marketValue,
      unrealized: marketValue - cost,
      unrealizedPct: cost > 0 ? (marketValue - cost) / cost : null,
      realized: Number(p.realized_pnl),
    };
  });

  const cash = Number(account?.cash ?? 0);
  const positionsValue = rows.reduce((sum, r) => sum + r.marketValue, 0);
  const equity = cash + positionsValue;
  const startingCash = Number(account?.starting_cash ?? 0);
  const totalReturn = equity - startingCash;
  const totalReturnPct = startingCash > 0 ? totalReturn / startingCash : null;
  const unrealized = rows.reduce((sum, r) => sum + r.unrealized, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-black/55 dark:text-white/55">
          Signed in as {user?.email}
        </p>
      </div>

      <TickerSearch />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total equity" value={formatMoney(equity)} primary />
        <SummaryCard label="Cash" value={formatMoney(cash)} />
        <SummaryCard label="Positions" value={formatMoney(positionsValue)} />
        <SummaryCard
          label="Total return"
          value={formatSignedMoney(totalReturn)}
          hint={
            totalReturnPct === null
              ? undefined
              : `${formatPercent(totalReturnPct)} vs ${formatMoney(startingCash)} start`
          }
          tone={totalReturn >= 0 ? "up" : "down"}
        />
      </div>

      {rows.length > 0 && (
        <p className="-mt-2 text-xs text-black/45 dark:text-white/45">
          Unrealized P&amp;L {formatSignedMoney(unrealized)} across {rows.length}{" "}
          holding{rows.length === 1 ? "" : "s"}
        </p>
      )}

      <PositionsTable rows={rows} />

      <WatchlistPanel />

      <NewsPanel />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  primary = false,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  primary?: boolean;
  tone?: "up" | "down";
}) {
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
        {label}
      </p>
      <p
        className={`mt-1 font-mono tabular-nums ${primary ? "text-2xl" : "text-xl"} ${
          tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "down"
              ? "text-red-600 dark:text-red-400"
              : ""
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-black/40 dark:text-white/40">{hint}</p>
      )}
    </div>
  );
}
