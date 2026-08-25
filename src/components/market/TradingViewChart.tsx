"use client";

import { useEffect, useId, useRef } from "react";

import { usePrefersDark } from "@/hooks/usePrefersDark";

// The real TradingView chart, via their free embeddable widget.
//
// This is a DIFFERENT product from "Advanced Charts", the self-hosted library
// that requires an application, a company and a non-free domain. The widget
// needs none of that — it is free for any site, including personal ones.
//
// The trade-off, stated plainly because it matters:
//   * Prices come from TRADINGVIEW, not from our Twelve Data feed. So the chart
//     can disagree slightly with the price the trade ticket fills at.
//   * It renders in an iframe, so we cannot draw our own position or trade
//     markers on it, and our saved-drawings feature does not apply. Drawings
//     persist only if the viewer signs into TradingView inside the widget.
//   * TradingView attribution is required and is built into the widget.
//
// Everything else is genuine TradingView: their drawing tools, indicators,
// timeframes and interactions.

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

const SCRIPT_SRC = "https://s3.tradingview.com/tv.js";

/** Load tv.js once for the whole page, not once per mount. */
let scriptPromise: Promise<void> | null = null;

function loadTradingView(): Promise<void> {
  if (window.TradingView) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("blocked")));
      return;
    }
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/**
 * Our exchange names to TradingView's prefixes.
 *
 * TradingView groups Arca, NYSE American, CBOE and IEX listings under AMEX.
 * When we are not confident, the bare ticker is passed and TradingView resolves
 * it itself — a wrong prefix shows "symbol not found", whereas no prefix
 * usually still finds the right listing.
 */
function tvSymbol(symbol: string, exchange: string | null): string {
  const e = (exchange ?? "").toUpperCase();
  if (e === "NASDAQ") return `NASDAQ:${symbol}`;
  if (e === "NYSE") return `NYSE:${symbol}`;
  if (
    e === "NYSE ARCA" ||
    e === "NYSE AMERICAN" ||
    e === "AMEX" ||
    e === "BATS" ||
    e === "CBOE" ||
    e === "IEX"
  ) {
    return `AMEX:${symbol}`;
  }
  return symbol;
}

export function TradingViewChart({
  symbol,
  exchange,
}: {
  symbol: string;
  exchange: string | null;
}) {
  const containerId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const holder = useRef<HTMLDivElement>(null);
  const dark = usePrefersDark();

  useEffect(() => {
    let cancelled = false;
    const el = holder.current;
    if (!el) return;

    loadTradingView()
      .then(() => {
        if (cancelled || !window.TradingView) return;
        // The widget replaces the container's contents; clear it so a theme or
        // symbol change doesn't stack two charts.
        el.innerHTML = "";

        new window.TradingView.widget({
          container_id: containerId,
          symbol: tvSymbol(symbol, exchange),
          interval: "D",
          timezone: "America/New_York",
          theme: dark ? "dark" : "light",
          style: "1", // candles
          locale: "en",
          autosize: true,
          withdateranges: true,
          // The left-hand drawing toolbar. Hidden by default in the widget,
          // and it is the entire point of using this.
          hide_side_toolbar: false,
          allow_symbol_change: false,
          save_image: true,
          details: false,
        });
      })
      .catch(() => {
        if (!cancelled && el) {
          el.innerHTML =
            '<p style="padding:2rem;text-align:center;font-size:.875rem;opacity:.6">' +
            "TradingView could not load. An ad blocker or network filter may be " +
            "blocking it — switch to the built-in chart above.</p>";
        }
      });

    return () => {
      cancelled = true;
      if (el) el.innerHTML = "";
    };
  }, [symbol, exchange, dark, containerId]);

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
      <div
        id={containerId}
        ref={holder}
        className="h-[520px] w-full sm:h-[620px]"
      />
    </div>
  );
}
