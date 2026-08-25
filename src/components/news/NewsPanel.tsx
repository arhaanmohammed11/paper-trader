"use client";

import { useEffect, useState } from "react";

type Article = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string;
  related: string[];
};

type SectorBucket = { id: string; label: string; articles: Article[] };

type Tab = "top" | "sectors" | "mine";

const TABS: { id: Tab; label: string }[] = [
  { id: "top", label: "Top stories" },
  { id: "sectors", label: "By sector" },
  { id: "mine", label: "My stocks" },
];

export function NewsPanel({ symbol }: { symbol?: string }) {
  const [tab, setTab] = useState<Tab>("top");
  const [openSector, setOpenSector] = useState<string | null>(null);

  // The response is stored WITH the query it answers. Loading and error are
  // then derived, rather than set inside the effect — which avoids a cascading
  // render and, more usefully, stops a previous tab's stories from showing
  // while the new tab is still loading.
  const query = symbol
    ? `tab=symbol&symbol=${encodeURIComponent(symbol)}`
    : `tab=${tab}`;

  const [payload, setPayload] = useState<{
    query: string;
    articles: Article[] | null;
    sectors: SectorBucket[] | null;
    skipped: string[];
    error: string | null;
  } | null>(null);

  const fresh = payload?.query === query;
  const loading = !fresh;
  const error = fresh ? payload.error : null;
  const articles = fresh ? payload.articles : null;
  const sectors = fresh ? payload.sectors : null;
  const skipped = fresh ? payload.skipped : [];

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/news?${query}`, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.message ?? "Couldn't load news.");
        return body;
      })
      .then((body) => {
        setPayload({
          query,
          articles: body.articles ?? null,
          sectors: body.sectors ?? null,
          skipped: body.skipped ?? [],
          error: null,
        });
        if (body.sectors?.length) setOpenSector((s) => s ?? body.sectors[0].id);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setPayload({
          query,
          articles: [],
          sectors: null,
          skipped: [],
          error: e.message,
        });
      });

    return () => controller.abort();
  }, [query]);

  return (
    <section className="overflow-hidden rounded-xl border border-black/10 dark:border-white/15">
      <div className="flex items-center gap-1 border-b border-black/10 p-2 dark:border-white/15">
        <h2 className="pr-2 text-sm font-medium">
          {symbol ? `${symbol} news` : "News"}
        </h2>
        {!symbol &&
          TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                tab === t.id
                  ? "bg-emerald-600 text-white"
                  : "text-black/60 hover:bg-black/[0.06] dark:text-white/60 dark:hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        {loading && (
          <span className="ml-auto pr-1 text-[10px] text-black/40 dark:text-white/40">
            loading…
          </span>
        )}
      </div>

      {error && (
        <p className="border-b border-black/10 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-white/15 dark:bg-amber-950/40 dark:text-amber-300">
          {error}
        </p>
      )}

      {skipped.length > 0 && (
        <p className="border-b border-black/10 px-4 py-1.5 text-[11px] text-black/45 dark:border-white/15 dark:text-white/45">
          Showing the first 8 symbols. Not included: {skipped.join(", ")}
        </p>
      )}

      {sectors ? (
        <div>
          <div className="flex flex-wrap gap-1 border-b border-black/10 p-2 dark:border-white/15">
            {sectors.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setOpenSector(s.id)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  openSector === s.id
                    ? "bg-black/[0.08] font-medium dark:bg-white/15"
                    : "text-black/55 hover:bg-black/[0.05] dark:text-white/55 dark:hover:bg-white/10"
                }`}
              >
                {s.label}
                <span className="ml-1.5 text-black/35 dark:text-white/35">
                  {s.articles.length}
                </span>
              </button>
            ))}
          </div>
          <ArticleList
            articles={sectors.find((s) => s.id === openSector)?.articles ?? []}
            loading={loading}
            emptyHint="Nothing in this sector in the latest batch of stories."
          />
        </div>
      ) : (
        <ArticleList
          articles={articles ?? []}
          loading={loading}
          emptyHint={
            symbol
              ? `No recent stories for ${symbol}.`
              : "Nothing here yet — add some stocks to a watchlist."
          }
        />
      )}
    </section>
  );
}

function ArticleList({
  articles,
  loading,
  emptyHint,
}: {
  articles: Article[];
  loading: boolean;
  emptyHint: string;
}) {
  if (loading && articles.length === 0) {
    return (
      <ul className="divide-y divide-black/[0.07] dark:divide-white/10">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-3 p-4">
            <div className="h-14 w-20 shrink-0 animate-pulse rounded bg-black/[0.06] dark:bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-black/[0.06] dark:bg-white/10" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-black/[0.06] dark:bg-white/10" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (articles.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-black/45 dark:text-white/45">
        {emptyHint}
      </p>
    );
  }

  return (
    <ul className="max-h-[520px] divide-y divide-black/[0.07] overflow-y-auto dark:divide-white/10">
      {articles.map((a) => (
        <li key={a.id}>
          <a
            href={a.url}
            target="_blank"
            // noreferrer alongside noopener: these are third-party links and the
            // target site has no business seeing where the click came from.
            rel="noopener noreferrer"
            className="flex gap-3 p-4 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
          >
            {a.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.image}
                alt=""
                loading="lazy"
                className="h-14 w-20 shrink-0 rounded object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{a.headline}</p>
              {a.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-black/55 dark:text-white/55">
                  {a.summary}
                </p>
              )}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-black/40 dark:text-white/40">
                <span className="font-medium">{a.source}</span>
                <span>·</span>
                <span>{relativeTime(a.publishedAt)}</span>
                {a.related.slice(0, 3).map((t) => (
                  <span key={t} className="font-mono">
                    {t}
                  </span>
                ))}
                <span className="ml-auto">↗</span>
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
