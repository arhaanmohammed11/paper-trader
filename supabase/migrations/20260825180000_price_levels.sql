-- Saved price levels, per user per symbol.
--
-- These are engine-independent on purpose. Drawings made inside the TradingView
-- widget cannot be persisted — it is a cross-origin iframe and the free widget
-- exposes no save/load API at all (save_load_adapter and friends belong to the
-- licensed Advanced Charts library). Levels live here instead, so the prices
-- that actually matter for a trade survive whichever chart is on screen.

create table if not exists public.price_levels (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references auth.users (id) on delete cascade,
    symbol     text not null,
    price      numeric(20,6) not null check (price > 0),
    label      text check (label is null or char_length(label) <= 40),
    kind       text not null default 'note'
               check (kind in ('support','resistance','target','stop','note')),
    created_at timestamptz not null default now(),
    -- The same price twice on one symbol is a duplicate, not two levels.
    unique (user_id, symbol, price)
);

create index if not exists price_levels_user_symbol_idx
    on public.price_levels (user_id, symbol, price);

alter table public.price_levels enable row level security;

drop policy if exists price_levels_own on public.price_levels;
create policy price_levels_own on public.price_levels
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete on public.price_levels to authenticated;
