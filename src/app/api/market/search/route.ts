import { NextResponse } from "next/server";

import { canSpendNonEssential } from "@/lib/market/budget";
import { registerInstruments } from "@/lib/market/cache";
import { getProvider } from "@/lib/market/provider";
import { rankMatches } from "@/lib/market/ranking";
import type { InstrumentMatch } from "@/lib/market/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Search is the sneaky quota killer: every keystroke is a potential API call.
// Mitigations, in order of how much they save:
//   1. the client debounces 300ms and requires 2+ characters
//   2. we answer from the local `instruments` table when it has a decent hit
//   3. every upstream result is persisted, so the local table keeps improving
// After a week of use most searches never touch the network.

const GOOD_ENOUGH_LOCAL_HITS = 5;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ matches: [], source: "none" });

  const admin = createAdminClient();
  const upper = q.toUpperCase();
  const COLUMNS = "symbol, name, exchange, currency, kind";

  // The candidate limit is deliberately generous. Postgres has no idea which
  // rows we consider good — ranking happens in TypeScript afterwards — so a
  // small unordered LIMIT silently truncates the *best* matches. Searching
  // "coca" returned 20 arbitrary Coca-Cola-ish rows that excluded KO itself.
  const [byName, exact] = await Promise.all([
    admin
      .from("instruments")
      .select(COLUMNS)
      .or(`symbol.like.${upper}%,name.ilike.%${q}%`)
      .limit(200),
    // An exact ticker must never be missed, whatever the fuzzy query returns.
    admin.from("instruments").select(COLUMNS).eq("symbol", upper).limit(1),
  ]);

  const localMatches: InstrumentMatch[] = [
    ...(exact.data ?? []),
    ...(byName.data ?? []),
  ].map((r) => ({
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchange,
    currency: r.currency,
    kind: r.kind,
  }));

  const ranked = rankMatches(localMatches, q);
  const exactHit = ranked.some((m) => m.symbol === upper);

  if (ranked.length >= GOOD_ENOUGH_LOCAL_HITS || exactHit) {
    return NextResponse.json({ matches: ranked, source: "local" });
  }

  // Local table is thin for this query. Only now consider spending credits —
  // and not at all if we're past the soft-shed threshold.
  if (!(await canSpendNonEssential())) {
    return NextResponse.json({
      matches: ranked,
      source: "local",
      shed: true,
    });
  }

  try {
    const provider = await getProvider();
    const upstream = await provider.search(q);
    await registerInstruments(upstream);

    // Merge so a good local hit isn't lost behind upstream ordering.
    const merged = rankMatches([...upstream, ...localMatches], q);
    return NextResponse.json({ matches: merged, source: "upstream" });
  } catch {
    // Degrade to whatever local had rather than failing the box the user is
    // actively typing into.
    return NextResponse.json({ matches: ranked, source: "local", degraded: true });
  }
}
