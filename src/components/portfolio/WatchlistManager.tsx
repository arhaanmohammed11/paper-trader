"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  createWatchlist,
  deleteWatchlist,
  renameWatchlist,
  type WatchResult,
} from "@/app/(app)/watchlist/actions";
import { formatMoney, formatPercent } from "@/lib/format";

export type Row = {
  symbol: string;
  isFavourite: boolean;
  price: number | null;
  changePct: number | null;
};

export type ListWithRows = {
  id: string;
  name: string;
  rows: Row[];
};

export function WatchlistManager({
  lists,
  favourites,
  stale,
}: {
  lists: ListWithRows[];
  favourites: Row[];
  stale: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [result, action] = useActionState(
    async (prev: WatchResult | null, fd: FormData) => {
      const r = await createWatchlist(prev, fd);
      if (r.ok) setAdding(false);
      return r;
    },
    null,
  );

  return (
    <div className="space-y-4">
      {favourites.length > 0 && (
        <ListCard
          title="★ Favourites"
          subtitle="across all lists"
          rows={favourites}
          stale={stale}
        />
      )}

      {lists.map((list) => (
        <EditableListCard key={list.id} list={list} stale={stale} />
      ))}

      {adding ? (
        <form
          action={action}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-black/20 p-3 dark:border-white/20"
        >
          <input
            name="name"
            autoFocus
            maxLength={40}
            placeholder="List name — Tech, Earnings, Long-term…"
            className="h-9 flex-1 rounded-lg border border-black/15 bg-transparent px-3 text-sm
                       focus:border-emerald-500 focus:outline-none dark:border-white/20"
          />
          <CreateButton />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-sm text-black/50 dark:text-white/50"
          >
            Cancel
          </button>
          {result && !result.ok && (
            <p className="w-full text-xs text-red-600 dark:text-red-400">
              {result.message}
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-black/20 py-2.5 text-sm
                     text-black/55 hover:bg-black/[0.03] dark:border-white/20 dark:text-white/55
                     dark:hover:bg-white/[0.05]"
        >
          + New watchlist
        </button>
      )}
    </div>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create"}
    </button>
  );
}

function EditableListCard({ list, stale }: { list: ListWithRows; stale: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function commitRename() {
    setRenaming(false);
    if (name.trim() === list.name) return;
    startTransition(async () => {
      const r = await renameWatchlist(list.id, name);
      if (!r.ok) {
        setName(list.name);
        setError(r.message ?? "Couldn't rename.");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteWatchlist(list.id);
      if (!r.ok) setError(r.message ?? "Couldn't delete.");
    });
  }

  return (
    <ListCard
      title={
        renaming ? (
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(list.name);
                setRenaming(false);
              }
            }}
            className="w-48 rounded border border-emerald-500 bg-transparent px-1.5 py-0.5 text-sm font-medium focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title="Click to rename"
            className="text-sm font-medium hover:underline underline-offset-4"
          >
            {list.name}
          </button>
        )
      }
      rows={list.rows}
      stale={stale}
      error={error}
      onDelete={remove}
    />
  );
}

function ListCard({
  title,
  subtitle,
  rows,
  stale,
  error,
  onDelete,
}: {
  title: React.ReactNode;
  subtitle?: string;
  rows: Row[];
  stale: boolean;
  error?: string | null;
  onDelete?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
      <div className="flex items-center gap-2 border-b border-black/10 px-4 py-2.5 dark:border-white/15">
        {typeof title === "string" ? (
          <h2 className="text-sm font-medium">{title}</h2>
        ) : (
          title
        )}
        {subtitle && (
          <span className="text-xs text-black/40 dark:text-white/40">{subtitle}</span>
        )}
        <span className="ml-auto text-xs text-black/40 dark:text-white/40">
          {stale ? "prices delayed" : `${rows.length}`}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete this list"
            className="text-xs text-black/35 hover:text-red-600 dark:text-white/35 dark:hover:text-red-400"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <p className="border-b border-black/10 bg-red-50 px-4 py-1.5 text-xs text-red-700 dark:border-white/15 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-black/45 dark:text-white/45">
          Empty — search a ticker and add it here.
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.07] dark:divide-white/10">
          {rows.map((r) => (
            <li key={r.symbol}>
              <Link
                href={`/stock/${r.symbol}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                <span className={r.isFavourite ? "text-amber-500" : "text-transparent"}>
                  ★
                </span>
                <span className="font-mono text-sm font-medium">{r.symbol}</span>
                <span className="ml-auto font-mono text-sm tabular-nums">
                  {r.price === null ? "—" : formatMoney(r.price)}
                </span>
                <span
                  className={`w-24 text-right font-mono text-xs tabular-nums ${
                    r.changePct === null
                      ? "text-black/35 dark:text-white/35"
                      : r.changePct >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {r.changePct === null ? "—" : formatPercent(r.changePct)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
