import Link from "next/link";

import { Button } from "@/components/ui/Button";

const STAGES = [
  { n: 0, title: "Scaffold + deploy", done: true },
  { n: 1, title: "Auth (Supabase email/password)", done: true },
  { n: 2, title: "Schema + $100,000 account bootstrap", done: true },
  { n: 3, title: "Market data — search + live prices", done: true },
  { n: 4, title: "Price charts", done: true },
  { n: 5, title: "Core trading loop", done: false },
  { n: 6, title: "History + performance", done: false },
  { n: 7, title: "Watchlist", done: false },
  { n: 8, title: "Limit orders", done: false },
  { n: 9, title: "Polish + mobile", done: false },
];

export default function Home() {
  const done = STAGES.filter((s) => s.done).length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Stage 4 · charts live
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Paper Trader</h1>
        <p className="text-base text-black/60 dark:text-white/60">
          Practice trading real markets with virtual cash. Real prices, fake
          money, no risk.
        </p>
      </header>

      <div className="flex gap-3">
        <Link href="/signup">
          <Button>Create account</Button>
        </Link>
        <Link href="/login">
          <Button variant="ghost">Sign in</Button>
        </Link>
      </div>

      <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Build progress</h2>
          <span className="font-mono text-sm text-black/50 dark:text-white/50">
            {done}/{STAGES.length}
          </span>
        </div>
        <ol className="space-y-1.5">
          {STAGES.map((s) => (
            <li
              key={s.n}
              className={`flex items-center gap-3 text-sm ${
                s.done ? "" : "text-black/40 dark:text-white/40"
              }`}
            >
              <span
                aria-hidden
                className={`grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] ${
                  s.done
                    ? "bg-emerald-500 text-white"
                    : "border border-current"
                }`}
              >
                {s.done ? "✓" : s.n}
              </span>
              <span>{s.title}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="font-mono text-xs text-black/40 dark:text-white/40">
        Next up — Stage 5: the core trading loop.
      </p>
    </main>
  );
}
