// Chart control vocabulary, shared by the toolbar and the data loader.
//
// The key correction over the first attempt: INTERVAL and RANGE are separate
// axes. "1D" used to mean both "5-minute candles" and "about a day of history",
// which meant you could never ask for, say, hourly candles over six months.

export type IntervalId =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1D"
  | "1W";

export type PeriodType = "minute" | "hour" | "day" | "week";

export const INTERVALS: {
  id: IntervalId;
  label: string;
  /** TradingView-style resolution, which /api/market/history speaks. */
  resolution: string;
  type: PeriodType;
  span: number;
  seconds: number;
}[] = [
  { id: "1m", label: "1m", resolution: "1", type: "minute", span: 1, seconds: 60 },
  { id: "5m", label: "5m", resolution: "5", type: "minute", span: 5, seconds: 300 },
  { id: "15m", label: "15m", resolution: "15", type: "minute", span: 15, seconds: 900 },
  { id: "30m", label: "30m", resolution: "30", type: "minute", span: 30, seconds: 1800 },
  { id: "1h", label: "1H", resolution: "60", type: "hour", span: 1, seconds: 3600 },
  { id: "4h", label: "4H", resolution: "240", type: "hour", span: 4, seconds: 14400 },
  { id: "1D", label: "1D", resolution: "1D", type: "day", span: 1, seconds: 86400 },
  { id: "1W", label: "1W", resolution: "1W", type: "week", span: 1, seconds: 604800 },
];

export type RangeId = "1D" | "5D" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "MAX";

export const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: "1D", label: "1D", days: 1 },
  { id: "5D", label: "5D", days: 5 },
  { id: "1M", label: "1M", days: 31 },
  { id: "3M", label: "3M", days: 93 },
  { id: "6M", label: "6M", days: 186 },
  { id: "1Y", label: "1Y", days: 366 },
  { id: "5Y", label: "5Y", days: 1830 },
  { id: "MAX", label: "MAX", days: 7300 },
];

/** Twelve Data returns at most 5000 bars per request. */
const MAX_BARS = 5000;

export function intervalById(id: IntervalId) {
  return INTERVALS.find((i) => i.id === id)!;
}

export function rangeById(id: RangeId) {
  return RANGES.find((r) => r.id === id)!;
}

/**
 * Whether a combination is fetchable at all. 1-minute candles over five years
 * is ~2 million bars — the provider silently truncates rather than erroring, so
 * the UI disables these instead of rendering a chart that mysteriously stops.
 *
 * Calendar days are ~30% trading time for intraday bars, so the estimate uses a
 * 0.3 factor rather than pretending markets run 24/7.
 */
export function estimatedBars(interval: IntervalId, range: RangeId): number {
  const i = intervalById(interval);
  const r = rangeById(range);
  const seconds = r.days * 86400;
  const tradingFactor = i.seconds < 86400 ? 0.27 : 1; // ~6.5h of 24h, weekdays only
  return Math.round((seconds / i.seconds) * tradingFactor);
}

export function isCombinationAllowed(
  interval: IntervalId,
  range: RangeId,
): boolean {
  return estimatedBars(interval, range) <= MAX_BARS;
}

/** A sane interval for a range, used when the current pick becomes illegal. */
export function defaultIntervalFor(range: RangeId): IntervalId {
  const preferred: Record<RangeId, IntervalId> = {
    "1D": "5m",
    "5D": "15m",
    "1M": "1h",
    "3M": "1D",
    "6M": "1D",
    "1Y": "1D",
    "5Y": "1W",
    MAX: "1W",
  };
  const pick = preferred[range];
  if (isCombinationAllowed(pick, range)) return pick;
  return "1D";
}

export type ChartStyle = "candle_solid" | "candle_stroke" | "ohlc" | "area";

export const CHART_STYLES: { id: ChartStyle; label: string }[] = [
  { id: "candle_solid", label: "Candles" },
  { id: "candle_stroke", label: "Hollow" },
  { id: "ohlc", label: "Bars" },
  { id: "area", label: "Line" },
];

/** Drawing tools, by klinecharts overlay name. */
export const DRAWING_TOOLS: {
  id: string;
  label: string;
  hint: string;
}[] = [
  { id: "segment", label: "Trend line", hint: "Two clicks: start and end" },
  { id: "rayLine", label: "Ray", hint: "Extends past the second point" },
  { id: "straightLine", label: "Extended line", hint: "Extends both ways" },
  { id: "horizontalStraightLine", label: "Horizontal", hint: "Support / resistance" },
  { id: "verticalStraightLine", label: "Vertical", hint: "Mark an event" },
  { id: "priceLine", label: "Price label", hint: "Horizontal line with its price" },
  { id: "rect", label: "Rectangle", hint: "Box a range" },
  { id: "circle", label: "Circle", hint: "Ring a point" },
  { id: "polygon", label: "Polygon", hint: "Click points, double-click to close" },
  { id: "parallelStraightLine", label: "Parallel channel", hint: "Two parallel lines" },
  { id: "priceChannelLine", label: "Price channel", hint: "Three-point channel" },
  { id: "fibonacciLine", label: "Fibonacci", hint: "Retracement levels" },
];

export const INDICATORS: { id: string; label: string; overlay: boolean }[] = [
  { id: "MA", label: "Moving average", overlay: true },
  { id: "EMA", label: "EMA", overlay: true },
  { id: "BOLL", label: "Bollinger bands", overlay: true },
  { id: "VOL", label: "Volume", overlay: false },
  { id: "MACD", label: "MACD", overlay: false },
  { id: "RSI", label: "RSI", overlay: false },
  { id: "KDJ", label: "KDJ", overlay: false },
];
