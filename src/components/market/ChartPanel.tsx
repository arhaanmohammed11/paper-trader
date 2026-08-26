"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chart, KLineData } from "klinecharts";

import { usePrefersDark } from "@/hooks/usePrefersDark";
import {
  CHART_STYLES,
  DRAWING_TOOLS,
  INDICATORS,
  INTERVALS,
  RANGES,
  TOOL_GROUPS,
  type ChartStyle,
  type IntervalId,
  type RangeId,
  defaultIntervalFor,
  estimatedBars,
  intervalById,
  isCombinationAllowed,
  rangeById,
} from "@/lib/market/chartConfig";
import { klineSync, loadKLine } from "@/lib/market/klineLoader";

/** Matches the swatch colours in the Price levels panel. */
function levelColour(kind: string): string {
  switch (kind) {
    case "support": return "#10b981";
    case "resistance": return "#ef4444";
    case "target": return "#3b82f6";
    case "stop": return "#f59e0b";
    default: return "#8b5cf6";
  }
}
import { registerShapes } from "@/lib/market/shapes";

// For the eventual TradingView swap: everything here talks to
// /api/market/history, which already speaks TradingView's resolution vocabulary
// and returns its {s,t,o,h,l,c,v} shape. This file is the whole job.

type Level = { id: string; price: number; kind: string; label: string | null };
type Props = { symbol: string; levels?: Level[] };

export function ChartPanel({ symbol, levels = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);

  // Daily candles over five years: the long view first. If a listing is
  // younger than that, the provider simply returns fewer bars and the chart
  // fits to what exists.
  const [interval, setIntervalId] = useState<IntervalId>("1D");
  const [range, setRange] = useState<RangeId>("5Y");
  const [style, setStyle] = useState<ChartStyle>("candle_solid");
  // No indicators by default — a clean chart. Add them from the Indicators menu.
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [armedTool, setArmedTool] = useState<string | null>(null);
  // Magnet snaps each point to the nearest OHLC value. Useful for drawing a
  // trend line off exact highs; actively in the way when boxing an arbitrary
  // region. Off by default, as in TradingView.
  const [magnet, setMagnet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<"draw" | "indicator" | null>(null);
  const dark = usePrefersDark();

  // The data loader is registered once, so it would close over the FIRST value
  // of these forever. Refs keep it reading current state.
  const rangeRef = useRef(range);
  const symbolRef = useRef(symbol);

  // Guards a save while we are programmatically re-adding saved overlays:
  // createOverlay fires the same callbacks a human drawing would, so without
  // this the restore would race the save and could persist a half-restored set.
  const restoringRef = useRef(false);
  const magnetRef = useRef(magnet);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Persist every overlay on the chart. Debounced, because dragging a trend
   * line fires continuously and each drag would otherwise be a round trip.
   *
   * Only timestamp/value are sent per point — `dataIndex` is a position inside
   * the currently loaded bars, so saving it would misplace the drawing after a
   * timeframe change.
   */
  const saveDrawings = useCallback(() => {
    if (restoringRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(() => {
      const chart = chartRef.current;
      if (!chart) return;

      const overlays = chart
        .getOverlays()
        // Locked overlays are the price levels we injected; they belong to the
        // levels table, and saving them here would duplicate them on reload.
        .filter((o) => !o.lock)
        .map((o) => ({
        name: o.name,
        points: (o.points ?? []).map((pt) => ({
          timestamp: pt.timestamp,
          value: pt.value,
        })),
        styles: o.styles,
        lock: o.lock,
        mode: o.mode,
      }));

      void fetch("/api/drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbolRef.current, overlays }),
      }).catch(() => {
        /* a failed save is not worth interrupting the chart for */
      });
    }, 600);
  }, []);

  const overlayHandlers = useCallback(
    () => ({
      onDrawEnd: () => {
        setArmedTool(null);
        saveDrawings();
        return false;
      },
      onRemoved: () => {
        setArmedTool(null);
        saveDrawings();
        return false;
      },
      onPressedMoveEnd: () => {
        saveDrawings();
        return false;
      },
    }),
    [saveDrawings],
  );

  const fetchBars = useCallback(
    async (resolution: string, from: number, to: number): Promise<KLineData[]> => {
      const res = await fetch(
        `/api/market/history?symbol=${encodeURIComponent(symbolRef.current)}` +
          `&resolution=${resolution}&from=${from}&to=${to}`,
      );
      const body = await res.json();
      if (body.s !== "ok") {
        if (body.s === "no_data") return [];
        throw new Error(body.errmsg ?? "Couldn't load price history.");
      }
      return body.t.map((t: number, i: number) => ({
        timestamp: t * 1000,
        open: body.o[i],
        high: body.h[i],
        low: body.l[i],
        close: body.c[i],
        volume: body.v[i],
      }));
    },
    [],
  );

  // ---- create the chart -------------------------------------------------
  // Depends on symbol and theme only. Interval, range, style and indicators are
  // applied imperatively further down, so changing them never rebuilds the
  // chart — which is what keeps your drawings alive.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    symbolRef.current = symbol;
    let cancelled = false;
    const handlers = overlayHandlers();

    loadKLine().then((kline) => {
      const { init } = kline;
      // Shapes are custom templates; they must exist before any is created.
      registerShapes(kline);
      // Cleanup already ran (StrictMode unmounts immediately on first mount).
      // Initialising here would leave an orphaned chart on the DOM node — two
      // live charts on one element, which is what "resets every two seconds and
      // glitches" actually was.
      if (cancelled) return;

      const axis = dark ? "#3f3f46" : "#e4e4e7";
      const text = dark ? "#a1a1aa" : "#52525b";
      const up = "#10b981";
      const down = "#ef4444";
      const accent = "#3b82f6";

      const chart = init(el, {
        // Bars are UTC-stamped; render in exchange time so a 09:30 bar reads as
        // 09:30 wherever the viewer is.
        timezone: "America/New_York",
        styles: {
          grid: {
            horizontal: { color: axis },
            vertical: { color: axis },
          },
          candle: {
            bar: {
              upColor: up,
              downColor: down,
              upBorderColor: up,
              downBorderColor: down,
              upWickColor: up,
              downWickColor: down,
            },
            tooltip: { offsetTop: 8 },
          },
          // Free-moving crosshair with a label on BOTH axes.
          crosshair: {
            horizontal: {
              line: { color: text, style: "dashed" },
              text: { backgroundColor: dark ? "#3f3f46" : "#52525b" },
            },
            vertical: {
              line: { color: text, style: "dashed" },
              text: { backgroundColor: dark ? "#3f3f46" : "#52525b" },
            },
          },
          // Drawing tools. The library defaults are a thin grey line with large
          // dark handles, which is what made trend lines look unfinished.
          overlay: {
            point: {
              color: accent,
              borderColor: "rgba(59,130,246,0.25)",
              borderSize: 1,
              radius: 4,
              activeColor: accent,
              activeBorderColor: "rgba(59,130,246,0.4)",
              activeBorderSize: 3,
              activeRadius: 5,
            },
            line: { color: accent, size: 2 },
            rect: {
              color: "rgba(59,130,246,0.10)",
              borderColor: accent,
              borderSize: 2,
              borderRadius: 2,
            },
            polygon: {
              color: "rgba(59,130,246,0.10)",
              borderColor: accent,
              borderSize: 2,
            },
            circle: {
              color: "rgba(59,130,246,0.10)",
              borderColor: accent,
              borderSize: 2,
            },
            text: {
              color: "#ffffff",
              backgroundColor: accent,
              size: 12,
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 3,
              paddingBottom: 3,
              borderRadius: 3,
            },
          },
          xAxis: {
            axisLine: { color: axis },
            tickLine: { color: axis },
            tickText: { color: text },
          },
          yAxis: {
            axisLine: { color: axis },
            tickLine: { color: axis },
            tickText: { color: text },
          },
        },
      });

      if (!chart) return;
      chartRef.current = chart;

      chart.setSymbol({ ticker: symbol, pricePrecision: 2, volumePrecision: 0 });

      chart.setDataLoader({
        getBars: async ({ type, period, callback }) => {
          // The Range control defines a BOUNDED window with a start and an end.
          //
          // Previously this reported `backward: true` whenever it returned any
          // bars, so the chart kept asking for earlier windows forever and each
          // response overlapped the last — which renders as the series looping
          // back to its first candle. A fixed range has an edge; say so.
          if (type === "backward" || type === "forward") {
            callback([], { backward: false, forward: false });
            return;
          }

          const spec =
            INTERVALS.find((i) => i.type === period.type && i.span === period.span) ??
            intervalById("1D");
          try {
            setError(null);
            const to = Math.floor(Date.now() / 1000);
            const from = to - rangeById(rangeRef.current).days * 86400;

            const bars = await fetchBars(spec.resolution, from, to);
            // Defensive: duplicate timestamps would stack bars on one slot.
            const seen = new Set<number>();
            const unique = bars.filter((b) =>
              seen.has(b.timestamp) ? false : (seen.add(b.timestamp), true),
            );
            callback(unique, { backward: false, forward: false });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Chart failed to load.");
            callback([], { backward: false, forward: false });
          } finally {
            setLoading(false);
          }
        },
      });

      const spec = intervalById(interval);
      chart.setPeriod({ type: spec.type, span: spec.span });
      chart.setStyles({ candle: { type: style } });
      for (const id of activeIndicators) {
        chart.createIndicator(id, INDICATORS.find((i) => i.id === id)?.overlay);
      }

      // Saved price levels, drawn as locked horizontal lines. Locked because
      // they are owned by the Price levels panel — dragging one here would
      // change what the chart shows without changing what is stored.
      for (const lv of levels) {
        chart.createOverlay({
          name: "horizontalStraightLine",
          points: [{ value: Number(lv.price) }],
          lock: true,
          styles: {
            line: { color: levelColour(lv.kind), size: 1, style: "dashed" },
          },
        });
      }

      // Restore saved drawings for this symbol.
      void fetch(`/api/drawings?symbol=${encodeURIComponent(symbol)}`)
        .then((r) => (r.ok ? r.json() : { overlays: [] }))
        .then((body) => {
          if (cancelled || !chartRef.current) return;
          const saved = body.overlays ?? [];
          if (saved.length === 0) return;

          restoringRef.current = true;
          try {
            for (const o of saved) {
              chartRef.current.createOverlay({
                name: o.name,
                points: o.points,
                styles: o.styles,
                lock: o.lock,
                mode: o.mode ?? "normal",
                ...handlers,
              });
            }
          } finally {
            restoringRef.current = false;
          }
        })
        .catch(() => {
          /* drawings are a nicety; never block the chart on them */
        });
    });

    return () => {
      cancelled = true;
      // Synchronous teardown. klineSync() is populated after the first load, so
      // this disposes immediately rather than in a later microtask — which is
      // the whole reason the module is cached at module scope.
      const mod = klineSync();
      if (mod && chartRef.current) {
        mod.dispose(el);
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, dark, overlayHandlers, levels]);

  // ---- imperative updates ------------------------------------------------
  useEffect(() => {
    rangeRef.current = range;
    const chart = chartRef.current;
    if (!chart) return;
    const spec = intervalById(interval);
    chart.setPeriod({ type: spec.type, span: spec.span });
    // setPeriod is a no-op when only the RANGE changed, so the chart would keep
    // showing the old window. resetData() forces the loader to run again.
    chart.resetData();
  }, [interval, range]);

  useEffect(() => {
    chartRef.current?.setStyles({ candle: { type: style } });
  }, [style]);

  useEffect(() => {
    magnetRef.current = magnet;
  }, [magnet]);

  function pickRange(next: RangeId) {
    setRange(next);
    if (!isCombinationAllowed(interval, next)) setIntervalId(defaultIntervalFor(next));
  }

  function startDrawing(name: string) {
    setMenu(null);
    setArmedTool(name);
    chartRef.current?.createOverlay({
      name,
      mode: magnetRef.current ? "weak_magnet" : "normal",
      ...overlayHandlers(),
    });
  }

  function toggleIndicator(id: string) {
    const chart = chartRef.current;
    if (!chart) return;
    const meta = INDICATORS.find((i) => i.id === id)!;
    if (activeIndicators.includes(id)) {
      chart.removeIndicator({ name: id });
      setActiveIndicators((a) => a.filter((x) => x !== id));
    } else {
      chart.createIndicator(id, meta.overlay);
      setActiveIndicators((a) => [...a, id]);
    }
    setMenu(null);
  }

  const toolMeta = DRAWING_TOOLS.find((t) => t.id === armedTool);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/15">
      <Toolbar
        interval={interval}
        range={range}
        style={style}
        menu={menu}
        magnet={magnet}
        onMagnet={setMagnet}
        activeIndicators={activeIndicators}
        loading={loading}
        onInterval={setIntervalId}
        onRange={pickRange}
        onStyle={setStyle}
        onMenu={setMenu}
        onDraw={startDrawing}
        onIndicator={toggleIndicator}
        onClear={() => {
          chartRef.current?.removeOverlay();
          setArmedTool(null);
          saveDrawings();
        }}
      />

      {toolMeta && (
        <p className="border-b border-black/10 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 dark:border-white/15 dark:bg-blue-950/40 dark:text-blue-300">
          <strong>{toolMeta.label}</strong> — {toolMeta.hint}
          <button
            type="button"
            onClick={() => setArmedTool(null)}
            className="ml-2 underline underline-offset-2"
          >
            cancel
          </button>
        </p>
      )}

      {error && (
        <p className="border-b border-black/10 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-white/15 dark:bg-amber-950/40 dark:text-amber-300">
          {error}
        </p>
      )}

      <div ref={containerRef} className="h-[340px] w-full sm:h-[480px]" />
    </section>
  );
}

function Toolbar(props: {
  interval: IntervalId;
  range: RangeId;
  style: ChartStyle;
  menu: "draw" | "indicator" | null;
  magnet: boolean;
  onMagnet: (v: boolean) => void;
  activeIndicators: string[];
  loading: boolean;
  onInterval: (i: IntervalId) => void;
  onRange: (r: RangeId) => void;
  onStyle: (s: ChartStyle) => void;
  onMenu: (m: "draw" | "indicator" | null) => void;
  onDraw: (name: string) => void;
  onIndicator: (id: string) => void;
  onClear: () => void;
}) {
  // Taller and wider on touch screens: px-2.5 py-1 is a ~26px target, well
  // under the ~44px a finger needs. Rows scroll sideways rather than wrapping,
  // so the toolbar stays two lines instead of six on a narrow phone.
  const btn =
    "shrink-0 rounded-md px-3 py-2 font-mono text-xs transition-colors " +
    "disabled:cursor-not-allowed disabled:opacity-30 sm:px-2.5 sm:py-1";
  const on = "bg-emerald-600 text-white";
  const off =
    "text-black/60 hover:bg-black/[0.06] dark:text-white/60 dark:hover:bg-white/10";
  const label =
    "shrink-0 pr-1 text-[10px] uppercase tracking-wide text-black/35 dark:text-white/35";

  return (
    <div className="relative space-y-1.5 border-b border-black/10 p-2 dark:border-white/15">
      <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className={label}>Interval</span>
        {INTERVALS.map((i) => {
          const allowed = isCombinationAllowed(i.id, props.range);
          return (
            <button
              key={i.id}
              type="button"
              disabled={!allowed}
              title={
                allowed
                  ? undefined
                  : `~${estimatedBars(i.id, props.range).toLocaleString()} bars — more than the 5,000 the data provider returns`
              }
              onClick={() => props.onInterval(i.id)}
              className={`${btn} ${props.interval === i.id ? on : off}`}
            >
              {i.label}
            </button>
          );
        })}
        {props.loading && (
          <span className="ml-auto pr-1 text-[10px] text-black/40 dark:text-white/40">
            loading…
          </span>
        )}
      </div>

      <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className={label}>Range</span>
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => props.onRange(r.id)}
            className={`${btn} ${props.range === r.id ? on : off}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className={label}>Style</span>
        {CHART_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => props.onStyle(s.id)}
            className={`${btn} ${props.style === s.id ? on : off}`}
          >
            {s.label}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/15" />

        <button
          type="button"
          onClick={() => props.onMenu(props.menu === "draw" ? null : "draw")}
          className={`${btn} ${props.menu === "draw" ? on : off}`}
        >
          Draw ▾
        </button>
        <button
          type="button"
          onClick={() => props.onMenu(props.menu === "indicator" ? null : "indicator")}
          className={`${btn} ${props.menu === "indicator" ? on : off}`}
        >
          Indicators ▾
        </button>
        <button type="button" onClick={props.onClear} className={`${btn} ${off}`}>
          Clear
        </button>
      </div>

      {props.menu === "draw" && (
        <Dropdown>
          <label className="flex cursor-pointer items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/15">
            <input
              type="checkbox"
              checked={props.magnet}
              onChange={(e) => props.onMagnet(e.target.checked)}
              className="size-3.5 accent-emerald-600"
            />
            <span className="font-medium">Magnet</span>
            <span className="ml-auto text-[10px] text-black/40 dark:text-white/40">
              snap to candle highs/lows
            </span>
          </label>

          <div className="max-h-80 overflow-y-auto">
            {TOOL_GROUPS.map((group) => (
              <div key={group}>
                <p className="bg-black/[0.03] px-3 py-1 text-[10px] uppercase tracking-wide text-black/40 dark:bg-white/[0.05] dark:text-white/40">
                  {group}
                </p>
                {DRAWING_TOOLS.filter((t) => t.group === group).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => props.onDraw(t.id)}
                    className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs hover:bg-black/[0.05] dark:hover:bg-white/10"
                  >
                    <span className="font-medium">{t.label}</span>
                    <span className="ml-auto text-[10px] text-black/40 dark:text-white/40">
                      {t.hint}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Dropdown>
      )}

      {props.menu === "indicator" && (
        <Dropdown>
          {INDICATORS.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => props.onIndicator(i.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-black/[0.05] dark:hover:bg-white/10"
            >
              <span
                className={`grid size-3.5 place-items-center rounded-sm border text-[9px] ${
                  props.activeIndicators.includes(i.id)
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-black/25 dark:border-white/30"
                }`}
              >
                {props.activeIndicators.includes(i.id) ? "✓" : ""}
              </span>
              {i.label}
            </button>
          ))}
        </Dropdown>
      )}
    </div>
  );
}

function Dropdown({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-2 top-full z-30 mt-1 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl dark:border-white/15 dark:bg-neutral-900">
      {children}
    </div>
  );
}
