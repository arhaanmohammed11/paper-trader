"use client";

import { ChartPanel } from "@/components/market/ChartPanel";
import { TradingViewChart } from "@/components/market/TradingViewChart";
import { useStoredChoice } from "@/hooks/useStoredChoice";

type Engine = "tradingview" | "builtin";
const ENGINES = ["tradingview", "builtin"] as const;
const STORAGE_KEY = "pt.chartEngine";

/**
 * Chooses between the TradingView widget and the built-in klinecharts panel.
 *
 * Both are kept because neither is strictly better:
 *
 *   TradingView — the full drawing toolkit and indicator library you already
 *   know, but it is an iframe fed by TradingView's own prices, so it cannot
 *   show your positions and its drawings are not saved to your account here.
 *
 *   Built-in — driven by the same Twelve Data feed the trade ticket fills
 *   from, so the chart and the fill price agree, and drawings persist per
 *   symbol across your devices.
 */
type Level = { id: string; price: number; kind: string; label: string | null };

export function ChartSwitcher({
  symbol,
  exchange,
  levels = [],
}: {
  symbol: string;
  exchange: string | null;
  levels?: Level[];
}) {
  // Defaults to TradingView; remembers whatever you picked last.
  const [engine, choose] = useStoredChoice<Engine>(
    STORAGE_KEY,
    ENGINES,
    "tradingview",
  );

  const tab =
    "rounded-md px-3 py-1 text-xs font-medium transition-colors";
  const on = "bg-emerald-600 text-white";
  const off =
    "text-black/55 hover:bg-black/[0.06] dark:text-white/55 dark:hover:bg-white/10";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <div className="flex gap-1 rounded-lg bg-black/[0.04] p-1 dark:bg-white/[0.06]">
          <button
            type="button"
            onClick={() => choose("tradingview")}
            className={`${tab} ${engine === "tradingview" ? on : off}`}
          >
            TradingView
          </button>
          <button
            type="button"
            onClick={() => choose("builtin")}
            className={`${tab} ${engine === "builtin" ? on : off}`}
          >
            Built-in
          </button>
        </div>
        <p className="pl-2 text-[11px] text-black/40 dark:text-white/40">
          {engine === "tradingview"
            ? "TradingView's own prices and tools. Drawings aren't saved here."
            : "Same price feed your orders fill at. Drawings saved per symbol."}
        </p>
      </div>

      {engine === "tradingview" ? (
        <TradingViewChart symbol={symbol} exchange={exchange} />
      ) : (
        <ChartPanel symbol={symbol} levels={levels} />
      )}
    </div>
  );
}
