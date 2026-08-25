import { notFound } from "next/navigation";

import { ChartSwitcher } from "@/components/market/ChartSwitcher";
import { WatchButtons } from "@/components/market/WatchButtons";
import { NewsPanel } from "@/components/news/NewsPanel";
import { PriceLevels } from "@/components/market/PriceLevels";
import { TradeTicket } from "@/components/trade/TradeTicket";

import { getQuotes } from "@/lib/market/cache";
import { getMarketStatus, marketStatusLabel } from "@/lib/market/hours";
import { normalizeSymbol } from "@/lib/market/provider";
import { formatMoney, formatPercent } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StockPage({ params }: PageProps<"/stock/[symbol]">) {
  // params is a Promise in Next 15+. Forgetting this await gives a confusing
  // error about a Promise where a string was expected.
  const { symbol: raw } = await params;
  const symbol = normalizeSymbol(raw);

  // Called directly rather than through /api/market/quote: this is already
  // server-side, so an HTTP hop to our own route would just add latency.
  const { quotes, stale } = await getQuotes([symbol]);
  const quote = quotes[0];

  if (!quote) notFound();

  const supabase = await createClient();
  await supabase.rpc("get_or_create_default_watchlist");

  const [{ data: lists }, { data: memberships }] = await Promise.all([
    supabase
      .from("watchlists")
      .select("id, name, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("watchlist_items")
      .select("watchlist_id, is_favourite")
      .eq("symbol", symbol),
  ]);

  const { data: account } = await supabase
    .rpc("get_or_create_account")
    .single<{ id: string; cash: number }>();

  const { data: levels } = await supabase
    .from("price_levels")
    .select("id, symbol, price, label, kind")
    .eq("symbol", symbol)
    .order("price", { ascending: false });

  const { data: position } = await supabase
    .from("positions")
    .select("qty")
    .eq("symbol", symbol)
    .maybeSingle();

  const inLists = new Set((memberships ?? []).map((m) => m.watchlist_id));
  const listOptions = (lists ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    contains: inLists.has(l.id),
  }));
  const isFavourite = (memberships ?? []).some((m) => m.is_favourite);

  const admin = createAdminClient();
  const { data: instrument } = await admin
    .from("instruments")
    .select("name, exchange")
    .eq("symbol", symbol)
    .maybeSingle();

  const status = getMarketStatus();
  const change =
    quote.prevClose !== null && quote.prevClose > 0
      ? quote.price - quote.prevClose
      : null;
  const changePct =
    change !== null && quote.prevClose ? change / quote.prevClose : null;
  const up = change !== null && change >= 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-3xl font-semibold tracking-tight">
            {symbol}
          </h1>
          {instrument?.name && (
            <p className="text-black/60 dark:text-white/60">{instrument.name}</p>
          )}
          {instrument?.exchange && (
            <span className="text-xs text-black/40 dark:text-white/40">
              {instrument.exchange}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-4xl tabular-nums">
            {formatMoney(quote.price)}
          </span>
          {change !== null && (
            <span
              className={`font-mono text-lg tabular-nums ${
                up
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {up ? "+" : ""}
              {formatMoney(change).replace("$", "")} ({formatPercent(changePct)})
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 ${
              status === "open"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-black/[0.06] text-black/60 dark:bg-white/10 dark:text-white/60"
            }`}
          >
            {marketStatusLabel(status)}
          </span>
          {stale && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Prices delayed
            </span>
          )}
          <span className="text-black/40 dark:text-white/40">
            as of {new Date(quote.fetchedAt).toLocaleTimeString("en-US")}
          </span>
        </div>
      </div>

      <WatchButtons
        symbol={symbol}
        lists={listOptions}
        initialFavourite={isFavourite}
      />

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Open" value={formatMoney(quote.dayOpen)} />
        <Stat label="Day high" value={formatMoney(quote.dayHigh)} />
        <Stat label="Day low" value={formatMoney(quote.dayLow)} />
        <Stat label="Prev close" value={formatMoney(quote.prevClose)} />
      </dl>

      <ChartSwitcher
        symbol={symbol}
        exchange={instrument?.exchange ?? null}
        levels={(levels ?? []).map((l) => ({
          id: l.id,
          price: Number(l.price),
          kind: l.kind,
          label: l.label,
        }))}
      />

      <PriceLevels
        symbol={symbol}
        currentPrice={quote.price}
        levels={(levels ?? []).map((l) => ({
          id: l.id,
          symbol: l.symbol,
          price: Number(l.price),
          label: l.label,
          kind: l.kind as "support" | "resistance" | "target" | "stop" | "note",
        }))}
      />

      <NewsPanel symbol={symbol} />

      {account && (
        <TradeTicket
          symbol={symbol}
          accountId={account.id}
          price={quote.price}
          cash={Number(account.cash)}
          holding={Number(position?.qty ?? 0)}
          marketOpen={status === "open"}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/15">
      <dt className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">
        {label}
      </dt>
      <dd className="mt-1 font-mono tabular-nums">{value}</dd>
    </div>
  );
}
