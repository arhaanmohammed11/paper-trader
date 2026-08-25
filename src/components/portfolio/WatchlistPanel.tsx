import {
  WatchlistManager,
  type ListWithRows,
  type Row,
} from "@/components/portfolio/WatchlistManager";
import { getQuotes } from "@/lib/market/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Dashboard watchlists. Server component: every symbol across every list is
 * quoted in ONE batched call through the read-through cache, not one per row
 * and not one per list.
 */
export async function WatchlistPanel() {
  const supabase = await createClient();

  // Ensure at least one list exists so the empty state has somewhere to add to.
  await supabase.rpc("get_or_create_default_watchlist");

  const [{ data: lists }, { data: items, error }] = await Promise.all([
    supabase
      .from("watchlists")
      .select("id, name, sort_order, created_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("watchlist_items")
      .select("symbol, is_favourite, sort_order, watchlist_id")
      .order("is_favourite", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("symbol", { ascending: true }),
  ]);

  if (error) {
    return (
      <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
        <p className="text-sm text-red-700 dark:text-red-300">
          Couldn&apos;t load your watchlists: {error.message}
        </p>
      </section>
    );
  }

  const allSymbols = [...new Set((items ?? []).map((i) => i.symbol))];
  const { quotes, stale } = await getQuotes(allSymbols);
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

  const toRow = (symbol: string, isFavourite: boolean): Row => {
    const q = bySymbol.get(symbol);
    const changePct =
      q && q.prevClose && q.prevClose > 0
        ? (q.price - q.prevClose) / q.prevClose
        : null;
    return { symbol, isFavourite, price: q?.price ?? null, changePct };
  };

  const withRows: ListWithRows[] = (lists ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    rows: (items ?? [])
      .filter((i) => i.watchlist_id === l.id)
      .map((i) => toRow(i.symbol, i.is_favourite)),
  }));

  // Favourites span every list, deduped — the same symbol starred in two lists
  // should appear once here.
  const favSymbols = [
    ...new Set((items ?? []).filter((i) => i.is_favourite).map((i) => i.symbol)),
  ];
  const favourites = favSymbols.map((s) => toRow(s, true));

  return (
    <WatchlistManager lists={withRows} favourites={favourites} stale={stale} />
  );
}
