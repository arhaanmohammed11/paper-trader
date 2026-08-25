-- Paper Trader — core schema.
--
-- Money rules, applied everywhere below:
--   * `numeric` only. Never float/double/real, and never the `money` type.
--   * Cash / notional / P&L  -> numeric(20,4)
--   * Prices                 -> numeric(20,6)
--   * Quantities             -> numeric(20,8)   (whole shares in the V1 UI)
--   * PostgREST serializes numeric as a JSON number, which JS parses as a
--     float64. Safe to DISPLAY, never safe to COMPUTE with. All money
--     arithmetic happens in SQL.

create extension if not exists pg_trgm with schema extensions;

-- ------------------------------------------------------------- accounts ----

create table if not exists public.accounts (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users (id) on delete cascade,
    name           text not null default 'Main'
                   check (char_length(name) between 1 and 60),
    base_currency  char(3) not null default 'USD',
    cash           numeric(20,4) not null default 100000.0000 check (cash >= 0),
    starting_cash  numeric(20,4) not null default 100000.0000 check (starting_cash > 0),
    net_deposits   numeric(20,4) not null default 100000.0000,
    created_at     timestamptz not null default now(),
    unique (user_id, name)
);

create index if not exists accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------- instruments ----
-- Shared symbol cache: readable by every authenticated user, written only by
-- service_role. Local-first search means most keystrokes cost zero API credits.

create table if not exists public.instruments (
    symbol      text primary key check (symbol = upper(symbol)),
    name        text not null default '',
    exchange    text not null default '',
    currency    char(3) not null default 'USD',
    kind        text not null default 'stock',
    updated_at  timestamptz not null default now()
);

create index if not exists instruments_name_trgm_idx
    on public.instruments using gin (name extensions.gin_trgm_ops);
create index if not exists instruments_symbol_prefix_idx
    on public.instruments (symbol text_pattern_ops);

-- ---------------------------------------------------------- quote_cache ----
-- The single source of execution prices. ONLY service_role writes here — that
-- is precisely what stops a client from dictating the price it trades at.

create table if not exists public.quote_cache (
    symbol       text primary key references public.instruments (symbol) on delete cascade,
    price        numeric(20,6) not null check (price > 0),
    prev_close   numeric(20,6),
    day_open     numeric(20,6),
    day_high     numeric(20,6),
    day_low      numeric(20,6),
    volume       bigint,
    source_ts    timestamptz,
    fetched_at   timestamptz not null default now(),
    is_stale     boolean not null default false
);

create index if not exists quote_cache_fetched_idx on public.quote_cache (fetched_at);

-- --------------------------------------------------------------- orders ----

create table if not exists public.orders (
    id             uuid primary key default gen_random_uuid(),
    account_id     uuid not null references public.accounts (id) on delete cascade,
    user_id        uuid not null references auth.users (id) on delete cascade,
    symbol         text not null references public.instruments (symbol),
    side           text not null check (side in ('buy','sell')),
    order_type     text not null check (order_type in ('market','limit')),
    qty            numeric(20,8) not null check (qty > 0),
    limit_price    numeric(20,6) check (limit_price is null or limit_price > 0),
    time_in_force  text not null default 'gtc' check (time_in_force in ('day','gtc')),
    status         text not null default 'open'
                   check (status in ('open','filled','cancelled','rejected','expired')),
    filled_qty     numeric(20,8) not null default 0 check (filled_qty >= 0),
    avg_fill_price numeric(20,6),
    reject_reason  text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    expires_at     timestamptz,
    constraint orders_limit_needs_price
        check (order_type <> 'limit' or limit_price is not null),
    constraint orders_market_no_price
        check (order_type <> 'market' or limit_price is null)
);

create index if not exists orders_user_status_idx
    on public.orders (user_id, status, created_at desc);
create index if not exists orders_open_limit_idx
    on public.orders (symbol) where status = 'open' and order_type = 'limit';

-- --------------------------------------------------------------- trades ----
-- Append-only ledger and the source of truth for positions.
-- Never updated, never deleted.

create table if not exists public.trades (
    id                uuid primary key default gen_random_uuid(),
    order_id          uuid not null references public.orders (id) on delete restrict,
    account_id        uuid not null references public.accounts (id) on delete cascade,
    user_id           uuid not null references auth.users (id) on delete cascade,
    symbol            text not null references public.instruments (symbol),
    side              text not null check (side in ('buy','sell')),
    qty               numeric(20,8) not null check (qty > 0),
    price             numeric(20,6) not null check (price > 0),
    gross_amount      numeric(20,4) not null generated always as (round(qty * price, 4)) stored,
    fee               numeric(20,4) not null default 0 check (fee >= 0),
    cash_delta        numeric(20,4) not null,   -- signed: -cost on buy, +proceeds on sell
    realized_pnl      numeric(20,4) not null default 0,
    avg_cost_at_trade numeric(20,6) not null default 0,
    quote_age_ms      integer,                  -- execution-quality audit trail
    executed_at       timestamptz not null default now()
);

create index if not exists trades_account_time_idx
    on public.trades (account_id, executed_at desc);
create index if not exists trades_replay_idx
    on public.trades (account_id, symbol, executed_at, id);

-- ------------------------------------------------------------ positions ----
-- Materialized, not a view: average cost is path-dependent (an ordered fold
-- over every trade, not a GROUP BY), and SELECT ... FOR UPDATE on a real row is
-- what serializes two concurrent sells. Rows are kept at qty = 0 to preserve
-- lifetime per-symbol realized P&L; the UI filters qty > 0.

create table if not exists public.positions (
    account_id    uuid not null references public.accounts (id) on delete cascade,
    symbol        text not null references public.instruments (symbol),
    user_id       uuid not null references auth.users (id) on delete cascade,
    qty           numeric(20,8) not null default 0 check (qty >= 0),
    avg_cost      numeric(20,6) not null default 0 check (avg_cost >= 0),
    realized_pnl  numeric(20,4) not null default 0,
    opened_at     timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    primary key (account_id, symbol)
);

create index if not exists positions_user_open_idx
    on public.positions (user_id) where qty > 0;

-- ------------------------------------------------------- watchlist_items ----

create table if not exists public.watchlist_items (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    symbol      text not null references public.instruments (symbol),
    note        text check (note is null or char_length(note) <= 280),
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now(),
    unique (user_id, symbol)
);

create index if not exists watchlist_user_idx
    on public.watchlist_items (user_id, sort_order);

-- --------------------------------------------------- portfolio_snapshots ----
-- One row per account per day. Charting equity from trades alone would need
-- that day's close for every symbol then held — a 1-year chart over 8 symbols
-- would fan out 8 historical calls per render and destroy the free quota.

create table if not exists public.portfolio_snapshots (
    account_id           uuid not null references public.accounts (id) on delete cascade,
    user_id              uuid not null references auth.users (id) on delete cascade,
    as_of_date           date not null,
    cash                 numeric(20,4) not null,
    positions_value      numeric(20,4) not null,
    equity               numeric(20,4) not null,
    realized_pnl_to_date numeric(20,4) not null default 0,
    net_deposits         numeric(20,4) not null,
    created_at           timestamptz not null default now(),
    primary key (account_id, as_of_date)
);

create index if not exists snapshots_user_date_idx
    on public.portfolio_snapshots (user_id, as_of_date);

-- ------------------------------------------------------------- api_usage ----
-- Daily credit ledger, so non-essential calls can be shed before the hard 429.

create table if not exists public.api_usage (
    provider      text not null,
    usage_date    date not null default (now() at time zone 'utc')::date,
    credits       integer not null default 0,
    limited_until timestamptz,
    primary key (provider, usage_date)
);
