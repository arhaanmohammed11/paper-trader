// The one place money becomes a string.
//
// Every numeric column arrives from PostgREST as a JSON number, which JS parses
// as a float64. That is fine for DISPLAY and never fine for ARITHMETIC — all
// money math happens in SQL. These helpers only format; if you ever find
// yourself adding or multiplying money in TypeScript, call an RPC instead.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PERCENT = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const QUANTITY = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return n === null ? "—" : USD.format(n);
}

/** Same as formatMoney but with an explicit + on gains, for P&L columns. */
export function formatSignedMoney(
  value: number | string | null | undefined,
): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return (n > 0 ? "+" : "") + USD.format(n);
}

/** `ratio` is a fraction: pass 0.0125 for 1.25%. */
export function formatPercent(
  ratio: number | string | null | undefined,
): string {
  const n = toNumber(ratio);
  if (n === null) return "—";
  return (n > 0 ? "+" : "") + PERCENT.format(n);
}

export function formatQuantity(
  value: number | string | null | undefined,
): string {
  const n = toNumber(value);
  return n === null ? "—" : QUANTITY.format(n);
}
