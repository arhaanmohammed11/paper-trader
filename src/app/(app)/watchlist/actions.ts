"use server";

import { revalidatePath } from "next/cache";

import { normalizeSymbol } from "@/lib/market/provider";
import { createClient } from "@/lib/supabase/server";

export type WatchResult = { ok: boolean; message?: string; watching?: boolean };

type Watchlist = { id: string; user_id: string; name: string; sort_order: number };

function refresh(symbol?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/watchlist");
  if (symbol) revalidatePath(`/stock/${symbol}`);
}

async function defaultListId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase
    .rpc("get_or_create_default_watchlist")
    .single<Watchlist>();
  return data?.id ?? null;
}

// ------------------------------------------------------------- lists ----

export async function createWatchlist(
  _prev: WatchResult | null,
  formData: FormData,
): Promise<WatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 40) {
    return { ok: false, message: "Name must be 1–40 characters." };
  }

  const { error } = await supabase
    .from("watchlists")
    .insert({ user_id: user.id, name });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: `You already have a list called "${name}".` };
    }
    return { ok: false, message: error.message };
  }

  refresh();
  return { ok: true, message: `Created "${name}".` };
}

export async function renameWatchlist(
  id: string,
  name: string,
): Promise<WatchResult> {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) {
    return { ok: false, message: "Name must be 1–40 characters." };
  }

  const { error } = await supabase
    .from("watchlists")
    .update({ name: trimmed })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: `You already have a list called "${trimmed}".` };
    }
    return { ok: false, message: error.message };
  }

  refresh();
  return { ok: true };
}

export async function deleteWatchlist(id: string): Promise<WatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  // Deleting your only list would leave the dashboard with nowhere to add a
  // symbol, and the bootstrap RPC would silently recreate one on next load.
  // Refusing is clearer than that quiet resurrection.
  const { count } = await supabase
    .from("watchlists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) <= 1) {
    return { ok: false, message: "You need at least one watchlist." };
  }

  // Items go with it via ON DELETE CASCADE.
  const { error } = await supabase.from("watchlists").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  refresh();
  return { ok: true };
}

// ------------------------------------------------------------- items ----

export async function toggleWatch(
  rawSymbol: string,
  watchlistId?: string,
): Promise<WatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) return { ok: false, message: "No symbol given." };

  const listId = watchlistId ?? (await defaultListId(supabase));
  if (!listId) return { ok: false, message: "Couldn't find a watchlist." };

  const { data: existing } = await supabase
    .from("watchlist_items")
    .select("id")
    .eq("watchlist_id", listId)
    .eq("symbol", symbol)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("watchlist_items")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, message: error.message };
    refresh(symbol);
    return { ok: true, watching: false };
  }

  const { error } = await supabase.from("watchlist_items").insert({
    user_id: user.id,
    watchlist_id: listId,
    symbol,
  });

  if (error) {
    // 23503 = foreign key violation: the symbol isn't in `instruments` yet.
    if (error.code === "23503") {
      return { ok: false, message: `We don't have data for ${symbol} yet.` };
    }
    return { ok: false, message: error.message };
  }

  refresh(symbol);
  return { ok: true, watching: true };
}

/** Star / unstar. Favourites pin to the top and appear in the dashboard's
 *  Favourites section, which spans every list. */
export async function toggleFavourite(
  rawSymbol: string,
  watchlistId?: string,
): Promise<WatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  const symbol = normalizeSymbol(rawSymbol);

  // Star anywhere it already appears; otherwise add it to the target list.
  const { data: existing } = await supabase
    .from("watchlist_items")
    .select("id, is_favourite")
    .eq("symbol", symbol)
    .order("is_favourite", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    const listId = watchlistId ?? (await defaultListId(supabase));
    if (!listId) return { ok: false, message: "Couldn't find a watchlist." };

    const { error } = await supabase.from("watchlist_items").insert({
      user_id: user.id,
      watchlist_id: listId,
      symbol,
      is_favourite: true,
    });
    if (error) {
      if (error.code === "23503") {
        return { ok: false, message: `We don't have data for ${symbol} yet.` };
      }
      return { ok: false, message: error.message };
    }
    refresh(symbol);
    return { ok: true, watching: true };
  }

  const { error } = await supabase
    .from("watchlist_items")
    .update({ is_favourite: !existing.is_favourite })
    .eq("id", existing.id);
  if (error) return { ok: false, message: error.message };

  refresh(symbol);
  return { ok: true, watching: true };
}

export async function moveToWatchlist(
  symbol: string,
  toListId: string,
): Promise<WatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  const { error } = await supabase
    .from("watchlist_items")
    .update({ watchlist_id: toListId })
    .eq("user_id", user.id)
    .eq("symbol", normalizeSymbol(symbol));

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "That symbol is already in the target list." };
    }
    return { ok: false, message: error.message };
  }

  refresh(symbol);
  return { ok: true };
}
