"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useDebounce } from "@/hooks/useDebounce";

type Match = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  kind: string;
};

/** Results are stored WITH the query they belong to. */
type Result = { query: string; matches: Match[] };

export function TickerSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>({ query: "", matches: [] });
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // 300ms debounce + a 2-character floor. Both exist to keep keystrokes from
  // becoming API calls.
  const debounced = useDebounce(query, 300);
  const q = debounced.trim();
  const searchable = q.length >= 2;

  // Loading and visibility are DERIVED from whether the stored result matches
  // the query being asked. Storing them as separate state meant setting state
  // inside the effect, and left stale matches on screen while a newer query was
  // still in flight.
  const fresh = result.query === q;
  const loading = searchable && !fresh;
  const visible = searchable && fresh ? result.matches : [];
  const open = !dismissed && visible.length > 0;

  useEffect(() => {
    if (!searchable) return;

    // Abort in-flight requests so a fast typist can't have an old response land
    // after a newer one.
    const controller = new AbortController();

    fetch(`/api/market/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : { matches: [] }))
      .then((data) => setResult({ query: q, matches: data.matches ?? [] }))
      .catch(() => {
        /* aborted or offline — leave the previous result in place */
      });

    return () => controller.abort();
  }, [q, searchable]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setDismissed(true);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  function go(symbol: string) {
    setDismissed(true);
    setQuery("");
    router.push(`/stock/${symbol}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" && query.trim().length >= 1) {
        // Let someone type a ticker they already know and just hit enter.
        go(query.trim().toUpperCase());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % visible.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + visible.length) % visible.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(visible[Math.min(active, visible.length - 1)].symbol);
    } else if (e.key === "Escape") {
      setDismissed(true);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setDismissed(false);
          setActive(0);
        }}
        onFocus={() => setDismissed(false)}
        onKeyDown={onKeyDown}
        placeholder="Search a ticker or company — AAPL, Tesla…"
        className="h-11 w-full rounded-lg border border-black/15 bg-transparent px-3 text-sm
                   placeholder:text-black/35 focus:border-emerald-500 focus:outline-none
                   dark:border-white/20 dark:placeholder:text-white/35"
      />

      {loading && (
        <span className="absolute right-3 top-3.5 text-xs text-black/40 dark:text-white/40">
          …
        </span>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border
                     border-black/10 bg-white shadow-lg dark:border-white/15 dark:bg-neutral-900"
        >
          {visible.map((m, i) => (
            <li key={`${m.symbol}-${m.exchange}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(m.symbol)}
                className={`flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm ${
                  i === active ? "bg-black/[0.05] dark:bg-white/[0.08]" : ""
                }`}
              >
                <span className="font-mono font-medium">{m.symbol}</span>
                <span className="truncate text-black/60 dark:text-white/60">
                  {m.name}
                </span>
                <span className="ml-auto shrink-0 text-xs text-black/40 dark:text-white/40">
                  {m.exchange}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
