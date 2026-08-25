import "server-only";

// US equity market hours, in America/New_York wall-clock time.
//
// Never hardcode a UTC offset here: ET is UTC-5 in winter and UTC-4 in summer,
// so an offset constant breaks twice a year on DST changeover. Intl gives us the
// real local time in that zone on any date.

export type MarketStatus = "pre" | "open" | "after" | "closed" | "holiday";

/**
 * NYSE full-day closures. Dates are the *observed* holiday, so a Saturday
 * holiday appears on the preceding Friday and a Sunday one on the following
 * Monday. TODO: extend annually — this covers 2026 and 2027.
 */
const HOLIDAYS = new Set([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (Jul 4 is a Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26", // Good Friday
  "2027-05-31",
  "2027-06-18", // Juneteenth observed (Jun 19 is a Saturday)
  "2027-07-05", // Independence Day observed (Jul 4 is a Sunday)
  "2027-09-06",
  "2027-11-25",
  "2027-12-24", // Christmas observed (Dec 25 is a Saturday)
]);

const ET = "America/New_York";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

type EtClock = {
  date: string; // YYYY-MM-DD in ET
  weekday: string; // "Mon" ... "Sun"
  minutes: number; // minutes since ET midnight
};

function etClock(now: Date): EtClock {
  const parts = Object.fromEntries(
    PARTS.formatToParts(now).map((p) => [p.type, p.value]),
  );
  // Intl renders midnight as "24" in some engines; normalize it to 0.
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: hour * 60 + Number(parts.minute),
  };
}

const PRE_OPEN = 4 * 60; //  04:00 ET
const OPEN = 9 * 60 + 30; //  09:30 ET
const CLOSE = 16 * 60; //  16:00 ET
const AFTER_END = 20 * 60; //  20:00 ET

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const { date, weekday, minutes } = etClock(now);

  if (weekday === "Sat" || weekday === "Sun") return "closed";
  if (HOLIDAYS.has(date)) return "holiday";

  if (minutes >= OPEN && minutes < CLOSE) return "open";
  if (minutes >= PRE_OPEN && minutes < OPEN) return "pre";
  if (minutes >= CLOSE && minutes < AFTER_END) return "after";
  return "closed";
}

export function isMarketOpen(now: Date = new Date()): boolean {
  return getMarketStatus(now) === "open";
}

/**
 * How long a cached quote stays fresh, in milliseconds.
 *
 * A dashboard holding 8 positions and refreshing every 15s costs at most
 * ~4 credits/min while the market is open, and zero when nothing is stale.
 * Outside session hours prices barely move, so the TTL stretches hard.
 */
export function quoteTtlMs(now: Date = new Date()): number {
  switch (getMarketStatus(now)) {
    case "open":
      return 15_000;
    case "pre":
    case "after":
      return 15 * 60_000;
    case "holiday":
    case "closed":
    default:
      return 60 * 60_000;
  }
}

export function marketStatusLabel(status: MarketStatus): string {
  switch (status) {
    case "open":
      return "Market open";
    case "pre":
      return "Pre-market";
    case "after":
      return "After hours";
    case "holiday":
      return "Market holiday";
    case "closed":
      return "Market closed";
  }
}
