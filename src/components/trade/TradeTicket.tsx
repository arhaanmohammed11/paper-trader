"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/format";

type Fill = {
  symbol: string;
  side: string;
  qty: number;
  price: number;
  gross: number;
  realized_pnl: number;
  cash: number;
  position_qty: number;
  avg_cost: number;
};

export function TradeTicket({
  symbol,
  accountId,
  price,
  cash,
  holding,
  marketOpen,
}: {
  symbol: string;
  accountId: string;
  price: number;
  cash: number;
  holding: number;
  marketOpen: boolean;
}) {
  const router = useRouter();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);

  const shares = Number(qty);
  const valid = Number.isFinite(shares) && shares > 0 && shares === Math.trunc(shares);
  // Display-only. The real check runs in SQL — never reimplement it here, or
  // the two versions will disagree eventually.
  const estimate = valid ? shares * price : 0;
  const maxAffordable = Math.floor(cash / price);

  async function submit() {
    setPending(true);
    setError(null);
    setFill(null);

    try {
      const res = await fetch("/api/trade/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, symbol, side, qty: shares }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? "Trade failed.");
        return;
      }
      setFill(body.fill);
      setQty("");
      // Refresh the server components so cash, positions and the dashboard
      // reflect the fill without a manual reload.
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  const tab = "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors";

  return (
    <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="mb-3 flex gap-1 rounded-lg bg-black/[0.04] p-1 dark:bg-white/[0.06]">
        <button
          type="button"
          onClick={() => setSide("buy")}
          className={`${tab} ${
            side === "buy"
              ? "bg-emerald-600 text-white"
              : "text-black/60 dark:text-white/60"
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("sell")}
          className={`${tab} ${
            side === "sell"
              ? "bg-red-600 text-white"
              : "text-black/60 dark:text-white/60"
          }`}
        >
          Sell
        </button>
      </div>

      <label className="block text-sm font-medium" htmlFor="qty">
        Shares
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="qty"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          className="h-10 w-full rounded-lg border border-black/15 bg-transparent px-3 font-mono
                     tabular-nums focus:border-emerald-500 focus:outline-none dark:border-white/20"
        />
        <button
          type="button"
          onClick={() =>
            setQty(String(side === "buy" ? maxAffordable : Math.trunc(holding)))
          }
          className="shrink-0 rounded-lg border border-black/15 px-3 text-xs
                     hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
        >
          Max
        </button>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <Row label="Price" value={formatMoney(price)} />
        <Row label="Estimated total" value={valid ? formatMoney(estimate) : "—"} />
        <Row
          label={side === "buy" ? "Buying power" : "Shares held"}
          value={side === "buy" ? formatMoney(cash) : String(holding)}
        />
      </dl>

      {!marketOpen && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Market is closed — this fills at the last traded price.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {fill && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          <p className="font-medium">
            {fill.side === "buy" ? "Bought" : "Sold"} {fill.qty} {fill.symbol} @{" "}
            {formatMoney(fill.price)}
          </p>
          <p className="mt-0.5 text-xs">
            Cash {formatMoney(fill.cash)}
            {fill.side === "sell" && Number(fill.realized_pnl) !== 0 && (
              <> · realized {formatMoney(fill.realized_pnl)}</>
            )}
          </p>
        </div>
      )}

      <Button
        onClick={submit}
        disabled={!valid || pending}
        className={`mt-4 w-full ${
          side === "sell" ? "bg-red-600 hover:bg-red-500" : ""
        }`}
      >
        {pending
          ? "Placing…"
          : `${side === "buy" ? "Buy" : "Sell"} ${valid ? shares : ""} ${symbol}`}
      </Button>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-black/55 dark:text-white/55">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
