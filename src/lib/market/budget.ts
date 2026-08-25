import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Daily credit ledger, so non-essential calls can be shed *before* the hard 429
// rather than discovering the limit by hitting it.
//
// Measured against the live API: one /quote call carrying N symbols costs N
// credits but consumes only ONE of the 8 requests/minute. So batching protects
// the rate limit, not the quota — both need watching, for different reasons.

const PROVIDER = "twelvedata";
const DAILY_LIMIT = 800;
const SOFT_SHED_AT = 0.8; // stop spending on search / long charts past here

type Usage = { credits: number; limitedUntil: Date | null };

async function readUsage(): Promise<Usage> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await admin
    .from("api_usage")
    .select("credits, limited_until")
    .eq("provider", PROVIDER)
    .eq("usage_date", today)
    .maybeSingle();

  return {
    credits: data?.credits ?? 0,
    limitedUntil: data?.limited_until ? new Date(data.limited_until) : null,
  };
}

/** True while a 429 circuit breaker is open — skip upstream entirely. */
export async function isCircuitOpen(): Promise<boolean> {
  const { limitedUntil } = await readUsage();
  return limitedUntil !== null && limitedUntil.getTime() > Date.now();
}

/**
 * Non-essential = search, long-range candles. Quotes on the trade path always
 * get through: trading must never break because someone typed a lot into the
 * search box.
 */
export async function canSpendNonEssential(): Promise<boolean> {
  const { credits, limitedUntil } = await readUsage();
  if (limitedUntil && limitedUntil.getTime() > Date.now()) return false;
  return credits < DAILY_LIMIT * SOFT_SHED_AT;
}

export async function recordCredits(count: number): Promise<void> {
  if (count <= 0) return;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { credits } = await readUsage();
  await admin.from("api_usage").upsert(
    { provider: PROVIDER, usage_date: today, credits: credits + count },
    { onConflict: "provider,usage_date" },
  );
}

/** Open the breaker after a 429. Don't hammer a rate limiter. */
export async function openCircuit(seconds = 60): Promise<void> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { credits } = await readUsage();

  await admin.from("api_usage").upsert(
    {
      provider: PROVIDER,
      usage_date: today,
      credits,
      limited_until: new Date(Date.now() + seconds * 1000).toISOString(),
    },
    { onConflict: "provider,usage_date" },
  );
}

export async function usageSummary() {
  const { credits, limitedUntil } = await readUsage();
  return {
    credits,
    limit: DAILY_LIMIT,
    limited: limitedUntil !== null && limitedUntil.getTime() > Date.now(),
  };
}
