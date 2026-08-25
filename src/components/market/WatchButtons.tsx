"use client";

import { useState, useTransition } from "react";

import { toggleFavourite, toggleWatch } from "@/app/(app)/watchlist/actions";

export type ListOption = { id: string; name: string; contains: boolean };

/**
 * Watch / favourite toggles for a stock page.
 *
 * Optimistic: the icon flips immediately and reverts if the server disagrees.
 * A star that waits for a round trip feels broken even when it works.
 */
export function WatchButtons({
  symbol,
  lists,
  initialFavourite,
}: {
  symbol: string;
  lists: ListOption[];
  initialFavourite: boolean;
}) {
  const [membership, setMembership] = useState<Record<string, boolean>>(
    Object.fromEntries(lists.map((l) => [l.id, l.contains])),
  );
  const [favourite, setFavourite] = useState(initialFavourite);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const watchedCount = Object.values(membership).filter(Boolean).length;

  function toggleList(listId: string) {
    const next = !membership[listId];
    setMembership((m) => ({ ...m, [listId]: next }));
    setError(null);
    startTransition(async () => {
      const r = await toggleWatch(symbol, listId);
      if (!r.ok) {
        setMembership((m) => ({ ...m, [listId]: !next }));
        setError(r.message ?? "Couldn't update your watchlist.");
      }
    });
  }

  function onFavourite() {
    const next = !favourite;
    setFavourite(next);
    setError(null);
    startTransition(async () => {
      const r = await toggleFavourite(symbol);
      if (!r.ok) {
        setFavourite(!next);
        setError(r.message ?? "Couldn't update your favourites.");
      }
    });
  }

  const base =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors";
  const neutral =
    "border-black/15 hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]";

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onFavourite}
        aria-pressed={favourite}
        className={`${base} ${
          favourite
            ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-300"
            : neutral
        }`}
      >
        <span aria-hidden>{favourite ? "★" : "☆"}</span>
        Favourite
      </button>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${base} ${
          watchedCount > 0
            ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            : neutral
        }`}
      >
        <span aria-hidden>{watchedCount > 0 ? "✓" : "+"}</span>
        {watchedCount === 0
          ? "Add to watchlist"
          : watchedCount === 1
            ? `In ${lists.find((l) => membership[l.id])?.name}`
            : `In ${watchedCount} lists`}
        <span aria-hidden className="text-xs opacity-60">
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Click-away layer, so the menu closes without a document listener. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <ul className="absolute left-0 top-11 z-30 w-60 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-xl dark:border-white/15 dark:bg-neutral-900">
            {lists.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => toggleList(l.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-black/[0.05] dark:hover:bg-white/10"
                >
                  <span
                    className={`grid size-4 shrink-0 place-items-center rounded border text-[10px] ${
                      membership[l.id]
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-black/25 dark:border-white/30"
                    }`}
                  >
                    {membership[l.id] ? "✓" : ""}
                  </span>
                  <span className="truncate">{l.name}</span>
                </button>
              </li>
            ))}
            {lists.length === 0 && (
              <li className="px-3 py-2 text-sm text-black/45 dark:text-white/45">
                No lists yet — create one on the dashboard.
              </li>
            )}
          </ul>
        </>
      )}

      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
