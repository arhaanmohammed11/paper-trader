// TradingView resolution <-> Twelve Data interval.
//
// TradingView's datafeed speaks "resolutions": minutes as bare numbers ("1",
// "5", "60"), then "1D" / "1W" / "1M". Twelve Data speaks intervals ("1min",
// "1h", "1day"). This is the seam between them, kept in one file so the
// supported list the chart advertises and the list we can actually serve can
// never drift apart.
//
// Verified against the live API: intraday windows resolve at least 3 years
// back, and daily reaches 2006 within the 5000-bar per-request cap.

export const RESOLUTION_TO_INTERVAL: Record<string, string> = {
  "1": "1min",
  "5": "5min",
  "15": "15min",
  "30": "30min",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  D: "1day",
  "1D": "1day",
  W: "1week",
  "1W": "1week",
  M: "1month",
  "1M": "1month",
};

/** Exactly what the chart is allowed to offer. */
export const SUPPORTED_RESOLUTIONS = [
  "1",
  "5",
  "15",
  "30",
  "60",
  "240",
  "1D",
  "1W",
  "1M",
] as const;

export function intervalFor(resolution: string): string | null {
  return RESOLUTION_TO_INTERVAL[resolution] ?? null;
}

export function isIntraday(resolution: string): boolean {
  return /^\d+$/.test(resolution);
}

/** Seconds covered by one bar — used to bound how many bars a window implies. */
export function barSeconds(resolution: string): number {
  if (/^\d+$/.test(resolution)) return Number(resolution) * 60;
  if (resolution === "D" || resolution === "1D") return 86_400;
  if (resolution === "W" || resolution === "1W") return 7 * 86_400;
  return 30 * 86_400;
}

/** Twelve Data caps a single response at 5000 bars. */
export const MAX_BARS = 5000;
