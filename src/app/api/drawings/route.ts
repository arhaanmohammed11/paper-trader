import { NextResponse } from "next/server";

import { normalizeSymbol } from "@/lib/market/provider";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only these fields are persisted; everything else klinecharts rebuilds. */
type SavedPoint = { timestamp: number; value: number };
type SavedOverlay = {
  name: string;
  points: SavedPoint[];
  styles?: unknown;
  lock?: boolean;
  mode?: string;
};

const MAX_OVERLAYS = 300;
const MAX_POINTS = 64;

/**
 * Validates and strips what the client sends.
 *
 * The client is not trusted to send a sane shape — this table is written with
 * the user's own privileges, so a malformed or enormous payload would simply be
 * stored and then break the chart on the next load. Rebuild the objects field
 * by field rather than passing anything through.
 */
function sanitize(input: unknown): SavedOverlay[] {
  if (!Array.isArray(input)) return [];

  const out: SavedOverlay[] = [];
  for (const raw of input.slice(0, MAX_OVERLAYS)) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.name !== "string" || o.name.length > 40) continue;

    const points: SavedPoint[] = [];
    if (Array.isArray(o.points)) {
      for (const p of o.points.slice(0, MAX_POINTS)) {
        if (typeof p !== "object" || p === null) continue;
        const pt = p as Record<string, unknown>;
        const timestamp = Number(pt.timestamp);
        const value = Number(pt.value);
        // A NaN here renders as an invisible, undeletable overlay.
        if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
        points.push({ timestamp, value });
      }
    }
    if (points.length === 0) continue;

    out.push({
      name: o.name,
      points,
      styles: o.styles ?? undefined,
      lock: typeof o.lock === "boolean" ? o.lock : undefined,
      mode: typeof o.mode === "string" ? o.mode : undefined,
    });
  }

  return out;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ overlays: [] }, { status: 401 });

  const symbol = normalizeSymbol(
    new URL(request.url).searchParams.get("symbol") ?? "",
  );
  if (!symbol) return NextResponse.json({ overlays: [] });

  const { data } = await supabase
    .from("chart_drawings")
    .select("overlays")
    .eq("symbol", symbol)
    .maybeSingle();

  return NextResponse.json({ overlays: data?.overlays ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { symbol?: string; overlays?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const symbol = normalizeSymbol(body.symbol ?? "");
  if (!symbol) return NextResponse.json({ ok: false }, { status: 400 });

  const overlays = sanitize(body.overlays);

  // An empty array is a legitimate state — it means "I cleared my drawings" —
  // so this deletes rather than storing an empty row forever.
  if (overlays.length === 0) {
    await supabase.from("chart_drawings").delete().eq("symbol", symbol);
    return NextResponse.json({ ok: true, count: 0 });
  }

  const { error } = await supabase.from("chart_drawings").upsert(
    { user_id: user.id, symbol, overlays, updated_at: new Date().toISOString() },
    { onConflict: "user_id,symbol" },
  );

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, count: overlays.length });
}
