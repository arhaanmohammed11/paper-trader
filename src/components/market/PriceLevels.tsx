"use client";

import { useState, useTransition } from "react";

import {
  addLevel,
  removeLevel,
  type LevelKind,
  type PriceLevel,
} from "@/app/(app)/levels/actions";
import { formatMoney, formatPercent } from "@/lib/format";

const KINDS: { id: LevelKind; label: string; colour: string }[] = [
  { id: "support", label: "Support", colour: "#10b981" },
  { id: "resistance", label: "Resistance", colour: "#ef4444" },
  { id: "target", label: "Target", colour: "#3b82f6" },
  { id: "stop", label: "Stop", colour: "#f59e0b" },
  { id: "note", label: "Note", colour: "#8b5cf6" },
];

export function kindColour(kind: string): string {
  return KINDS.find((k) => k.id === kind)?.colour ?? "#8b5cf6";
}

/**
 * Price levels for a symbol.
 *
 * These exist because drawings made inside the TradingView widget cannot be
 * saved — it is a cross-origin iframe and the free widget has no save/load API.
 * Levels are stored in the account instead, so they are on screen whichever
 * chart engine is selected, and they render as lines on the built-in chart.
 */
export function PriceLevels({
  symbol,
  levels,
  currentPrice,
}: {
  symbol: string;
  levels: PriceLevel[];
  currentPrice: number;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [kind, setKind] = useState<LevelKind>("support");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const p = Number(price);
    setError(null);
    startTransition(async () => {
      const r = await addLevel(symbol, p, kind, label);
      if (!r.ok) setError(r.message ?? "Couldn't add that level.");
      else {
        setPrice("");
        setLabel("");
        setOpen(false);
      }
    });
  }

  function drop(id: string) {
    startTransition(async () => {
      const r = await removeLevel(id, symbol);
      if (!r.ok) setError(r.message ?? "Couldn't remove that level.");
    });
  }

  const sorted = [...levels].sort((a, b) => Number(b.price) - Number(a.price));

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/15">
      <div className="flex items-center gap-2 border-b border-black/10 px-4 py-2.5 dark:border-white/15">
        <h2 className="text-sm font-medium">Price levels</h2>
        <span className="text-xs text-black/40 dark:text-white/40">
          saved to your account
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            if (!price) setPrice(currentPrice.toFixed(2));
          }}
          className="ml-auto rounded-md px-2.5 py-1 text-xs text-black/60 hover:bg-black/[0.06] dark:text-white/60 dark:hover:bg-white/10"
        >
          {open ? "Cancel" : "+ Add level"}
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-b border-black/10 p-3 dark:border-white/15">
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
              className="h-9 w-28 rounded-lg border border-black/15 bg-transparent px-2 font-mono text-sm
                         focus:border-emerald-500 focus:outline-none dark:border-white/20"
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as LevelKind)}
              className="h-9 rounded-lg border border-black/15 bg-transparent px-2 text-sm
                         focus:border-emerald-500 focus:outline-none dark:border-white/20"
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Note (optional)"
              maxLength={40}
              className="h-9 flex-1 rounded-lg border border-black/15 bg-transparent px-2 text-sm
                         focus:border-emerald-500 focus:outline-none dark:border-white/20"
            />
            <button
              type="button"
              onClick={submit}
              disabled={pending || !price}
              className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Add"}
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-black/45 dark:text-white/45">
          No levels yet. Add the prices you care about — they show on the
          built-in chart and stay here across your devices.
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.07] dark:divide-white/10">
          {sorted.map((l) => {
            const p = Number(l.price);
            const away = currentPrice > 0 ? (p - currentPrice) / currentPrice : null;
            return (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2">
                <span
                  aria-hidden
                  className="h-3 w-1 rounded-full"
                  style={{ backgroundColor: kindColour(l.kind) }}
                />
                <span className="font-mono text-sm tabular-nums">
                  {formatMoney(p)}
                </span>
                <span className="text-xs capitalize text-black/50 dark:text-white/50">
                  {l.kind}
                </span>
                {l.label && (
                  <span className="truncate text-xs text-black/45 dark:text-white/45">
                    {l.label}
                  </span>
                )}
                <span
                  className={`ml-auto font-mono text-xs tabular-nums ${
                    away === null
                      ? ""
                      : away >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {away === null ? "" : formatPercent(away)}
                </span>
                <button
                  type="button"
                  onClick={() => drop(l.id)}
                  aria-label={`Remove level at ${p}`}
                  className="text-xs text-black/30 hover:text-red-600 dark:text-white/30 dark:hover:text-red-400"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
