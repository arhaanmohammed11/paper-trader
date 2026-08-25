-- Paper Trader — Row Level Security and grants.
--
-- The shape that matters: `accounts` and `watchlist_items` are fully writable
-- by their owner, but `orders`, `trades`, `positions` and `portfolio_snapshots`
-- get SELECT policies ONLY. The absence of insert/update/delete policies is
-- deliberate — only the SECURITY DEFINER RPCs may write them, which is what
-- makes hand-editing your own cash balance impossible.
--
-- `auto_expose_new_tables` is unset on new cloud projects, so the explicit
-- GRANTs at the bottom are required, not decorative.

alter table public.accounts             enable row level security;
alter table public.instruments          enable row level security;
alter table public.quote_cache          enable row level security;
alter table public.orders               enable row level security;
alter table public.trades               enable row level security;
alter table public.positions            enable row level security;
alter table public.watchlist_items      enable row level security;
alter table public.portfolio_snapshots  enable row level security;
alter table public.api_usage            enable row level security;

-- --------------------------------------------------- owner-writable ----

drop policy if exists accounts_own on public.accounts;
create policy accounts_own on public.accounts
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists watchlist_items_own on public.watchlist_items;
create policy watchlist_items_own on public.watchlist_items
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ------------------------------------------------ read-only to owner ----
-- Writes go through the RPCs. Do not add write policies to these four.

drop policy if exists orders_own_read on public.orders;
create policy orders_own_read on public.orders
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists trades_own_read on public.trades;
create policy trades_own_read on public.trades
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists positions_own_read on public.positions;
create policy positions_own_read on public.positions
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists portfolio_snapshots_own_read on public.portfolio_snapshots;
create policy portfolio_snapshots_own_read on public.portfolio_snapshots
    for select to authenticated using (auth.uid() = user_id);

-- ----------------------------------------- shared, service_role-write ----

drop policy if exists instruments_read_all on public.instruments;
create policy instruments_read_all on public.instruments
    for select to authenticated using (true);

drop policy if exists quote_cache_read_all on public.quote_cache;
create policy quote_cache_read_all on public.quote_cache
    for select to authenticated using (true);

-- `api_usage` intentionally has NO policy: RLS is on and nothing matches, so it
-- is invisible to users. service_role bypasses RLS and can still write it.

-- ---------------------------------------------------------- grants ----

grant select on public.orders, public.trades, public.positions,
                public.portfolio_snapshots, public.instruments, public.quote_cache
    to authenticated;

grant select, insert, update, delete on public.accounts, public.watchlist_items
    to authenticated;
