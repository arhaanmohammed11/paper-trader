"use server";

import { revalidatePath } from "next/cache";

import { normalizeSymbol } from "@/lib/market/provider";
import { createClient } from "@/lib/supabase/server";

export type LevelKind = "support" | "resistance" | "target" | "stop" | "note";
export type LevelResult = { ok: boolean; message?: string };

export type PriceLevel = {
  id: string;
  symbol: string;
  price: number;
  label: string | null;
  kind: LevelKind;
};

export async function addLevel(
  symbol: string,
  price: number,
  kind: LevelKind,
  label: string,
): Promise<LevelResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You're signed out — sign in again." };

  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, message: "Enter a price above zero." };
  }
  if (label.length > 40) {
    return { ok: false, message: "Label is too long (40 characters max)." };
  }

  const { error } = await supabase.from("price_levels").insert({
    user_id: user.id,
    symbol: normalizeSymbol(symbol),
    // Rounded to the same precision the column stores, so the unique
    // constraint sees 305.0 and 305.00 as the same level rather than two.
    price: Number(price.toFixed(6)),
    kind,
    label: label.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: `You already have a level at ${price}.` };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/stock/${normalizeSymbol(symbol)}`);
  return { ok: true };
}

export async function removeLevel(id: string, symbol: string): Promise<LevelResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("price_levels").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/stock/${normalizeSymbol(symbol)}`);
  return { ok: true };
}
