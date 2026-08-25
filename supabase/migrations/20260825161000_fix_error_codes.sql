-- Fix the error codes so rejections are readable instead of HTTP 502.
--
-- THE BUG: PostgREST treats a SQLSTATE matching `PT<three digits>` as the HTTP
-- status to respond with. The original codes were PT001..PT006, so PostgREST
-- tried to answer with HTTP status 1, 2, 3, 5 and 6 — none of which are valid,
-- so the edge proxy dropped the connection and the caller saw:
--
--     502  upstream connect error or disconnect/reset before headers
--
-- Every business rule still fired correctly; the *reason* just never survived
-- the trip. "Insufficient funds" was indistinguishable from a network fault.
--
-- The fix uses that same PostgREST convention deliberately: PT400 => 400,
-- PT404 => 404, and so on, with a machine-readable tag in DETAIL (PostgREST
-- surfaces it as `details`) so the UI can map messages without parsing prose.

create or replace function public._apply_fill(
    p_account_id   uuid,
    p_symbol       text,
    p_side         text,
    p_qty          numeric,
    p_price        numeric,
    p_order_id     uuid,
    p_quote_age_ms integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_acct       public.accounts;
    v_pos        public.positions;
    v_symbol     text := upper(p_symbol);
    v_gross      numeric(20,4);
    v_cash_delta numeric(20,4);
    v_realized   numeric(20,4) := 0;
    v_new_qty    numeric(20,8);
    v_new_avg    numeric(20,6);
    v_trade_id   uuid;
begin
    -- LOCK 1: the account. Serializes two tabs trying to spend the same cash.
    select * into v_acct from public.accounts
     where id = p_account_id for update;
    if not found then
        raise exception 'Account not found'
            using errcode = 'PT404', detail = 'ACCOUNT_NOT_FOUND';
    end if;

    -- LOCK 2: the position. Always after the account, never before.
    insert into public.positions (account_id, symbol, user_id)
         values (p_account_id, v_symbol, v_acct.user_id)
    on conflict (account_id, symbol) do nothing;

    select * into v_pos from public.positions
     where account_id = p_account_id and symbol = v_symbol for update;

    v_gross := round(p_qty * p_price, 4);

    if p_side = 'buy' then
        if v_gross > v_acct.cash then
            raise exception 'Not enough cash: this costs %, you have %',
                to_char(v_gross, 'FM999,999,999.00'),
                to_char(v_acct.cash, 'FM999,999,999.00')
                using errcode = 'PT422', detail = 'INSUFFICIENT_FUNDS';
        end if;
        v_new_qty := v_pos.qty + p_qty;
        if v_new_qty = 0 then
            raise exception 'Invalid quantity'
                using errcode = 'PT400', detail = 'INVALID_ORDER';
        end if;
        v_new_avg    := round((v_pos.qty * v_pos.avg_cost + v_gross) / v_new_qty, 6);
        v_cash_delta := -v_gross;
    else
        if p_qty > v_pos.qty then
            raise exception 'You only hold % share(s) of %',
                to_char(v_pos.qty, 'FM999,999,999'), v_symbol
                using errcode = 'PT422', detail = 'INSUFFICIENT_SHARES';
        end if;
        -- Average cost: a sell realizes P&L but never changes the basis.
        v_realized   := round(p_qty * (p_price - v_pos.avg_cost), 4);
        v_new_qty    := v_pos.qty - p_qty;
        v_new_avg    := case when v_new_qty = 0 then 0 else v_pos.avg_cost end;
        v_cash_delta := v_gross;
    end if;

    insert into public.trades (
        order_id, account_id, user_id, symbol, side, qty, price,
        cash_delta, realized_pnl, avg_cost_at_trade, quote_age_ms
    ) values (
        p_order_id, p_account_id, v_acct.user_id, v_symbol, p_side, p_qty, p_price,
        v_cash_delta, v_realized, v_pos.avg_cost, p_quote_age_ms
    ) returning id into v_trade_id;

    update public.positions
       set qty          = v_new_qty,
           avg_cost     = v_new_avg,
           realized_pnl = realized_pnl + v_realized,
           updated_at   = now()
     where account_id = p_account_id and symbol = v_symbol;

    update public.accounts
       set cash = cash + v_cash_delta
     where id = p_account_id
     returning * into v_acct;

    perform public.snapshot_account(p_account_id, null);

    return jsonb_build_object(
        'trade_id',     v_trade_id,
        'order_id',     p_order_id,
        'symbol',       v_symbol,
        'side',         p_side,
        'qty',          p_qty,
        'price',        p_price,
        'gross',        v_gross,
        'realized_pnl', v_realized,
        'cash',         v_acct.cash,
        'position_qty', v_new_qty,
        'avg_cost',     v_new_avg
    );
end;
$$;

create or replace function public.execute_market_order(
    p_account_id     uuid,
    p_symbol         text,
    p_side           text,
    p_qty            numeric,
    p_max_quote_age  interval default '90 seconds'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid      uuid := auth.uid();
    v_symbol   text := upper(p_symbol);
    v_price    numeric(20,6);
    v_fetched  timestamptz;
    v_age_ms   integer;
    v_order_id uuid;
begin
    if v_uid is null then
        raise exception 'Not signed in'
            using errcode = 'PT401', detail = 'NOT_AUTHENTICATED';
    end if;

    if p_side not in ('buy','sell') then
        raise exception 'Side must be buy or sell'
            using errcode = 'PT400', detail = 'INVALID_ORDER';
    end if;

    -- Whole shares in V1. Columns are numeric(20,8), so allowing fractional
    -- later is a change here, not a migration.
    if p_qty is null or p_qty <= 0 or p_qty <> trunc(p_qty) then
        raise exception 'Quantity must be a whole number greater than zero'
            using errcode = 'PT400', detail = 'INVALID_ORDER';
    end if;

    if not exists (
        select 1 from public.accounts
         where id = p_account_id and user_id = v_uid
    ) then
        raise exception 'Account not found'
            using errcode = 'PT404', detail = 'ACCOUNT_NOT_FOUND';
    end if;

    -- THE PRICE COMES FROM HERE, NOT FROM THE CALLER. There is deliberately no
    -- price parameter: this function is callable directly over PostgREST, so a
    -- caller-supplied price would let anyone buy at $0.01.
    select price, fetched_at into v_price, v_fetched
      from public.quote_cache
     where symbol = v_symbol;

    if v_price is null then
        raise exception 'No price available for % yet', v_symbol
            using errcode = 'PT409', detail = 'NO_QUOTE';
    end if;

    if now() - v_fetched > p_max_quote_age then
        raise exception 'The price for % is out of date — try again in a moment', v_symbol
            using errcode = 'PT409', detail = 'STALE_QUOTE';
    end if;

    v_age_ms := floor(extract(epoch from (now() - v_fetched)) * 1000);

    insert into public.orders (
        account_id, user_id, symbol, side, order_type, qty,
        status, filled_qty, avg_fill_price
    ) values (
        p_account_id, v_uid, v_symbol, p_side, 'market', p_qty,
        'filled', p_qty, v_price
    ) returning id into v_order_id;

    return public._apply_fill(
        p_account_id, v_symbol, p_side, p_qty, v_price, v_order_id, v_age_ms
    );
end;
$$;

create or replace function public.reset_account(
    p_account_id    uuid,
    p_starting_cash numeric default 100000
) returns public.accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid  uuid := auth.uid();
    v_acct public.accounts;
begin
    if v_uid is null then
        raise exception 'Not signed in'
            using errcode = 'PT401', detail = 'NOT_AUTHENTICATED';
    end if;

    if p_starting_cash is null or p_starting_cash < 100 or p_starting_cash > 100000000 then
        raise exception 'Starting cash must be between $100 and $100,000,000'
            using errcode = 'PT400', detail = 'INVALID_STARTING_CASH';
    end if;

    select * into v_acct from public.accounts
     where id = p_account_id and user_id = v_uid for update;
    if not found then
        raise exception 'Account not found'
            using errcode = 'PT404', detail = 'ACCOUNT_NOT_FOUND';
    end if;

    -- Order matters: trades reference orders ON DELETE RESTRICT, so trades go
    -- first or the orders delete fails.
    delete from public.trades              where account_id = p_account_id;
    delete from public.orders              where account_id = p_account_id;
    delete from public.positions           where account_id = p_account_id;
    delete from public.portfolio_snapshots where account_id = p_account_id;

    update public.accounts
       set cash          = round(p_starting_cash, 4),
           starting_cash = round(p_starting_cash, 4),
           net_deposits  = round(p_starting_cash, 4)
     where id = p_account_id
     returning * into v_acct;

    perform public.snapshot_account(p_account_id, null);
    return v_acct;
end;
$$;

create or replace function public.recompute_positions(p_account_id uuid)
returns table (
    symbol        text,
    stored_qty    numeric,
    replayed_qty  numeric,
    stored_avg    numeric,
    replayed_avg  numeric,
    ok            boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'Not signed in'
            using errcode = 'PT401', detail = 'NOT_AUTHENTICATED';
    end if;
    if not exists (
        select 1 from public.accounts where id = p_account_id and user_id = v_uid
    ) then
        raise exception 'Account not found'
            using errcode = 'PT404', detail = 'ACCOUNT_NOT_FOUND';
    end if;

    return query
    with ordered as (
        select t.symbol, t.side, t.qty, t.price,
               row_number() over (partition by t.symbol order by t.executed_at, t.id) as rn
          from public.trades t
         where t.account_id = p_account_id
    ),
    replay as (
        select o.symbol,
               sum(case when o.side = 'buy' then o.qty else -o.qty end) as final_qty,
               sum(case when o.side = 'buy' then o.qty * o.price else 0 end) as buy_cost,
               sum(case when o.side = 'buy' then o.qty else 0 end) as buy_qty
          from ordered o
         group by o.symbol
    )
    select p.symbol,
           p.qty,
           coalesce(r.final_qty, 0),
           p.avg_cost,
           case when coalesce(r.buy_qty, 0) = 0 then 0
                else round(r.buy_cost / r.buy_qty, 6) end,
           p.qty = coalesce(r.final_qty, 0)
      from public.positions p
      left join replay r on r.symbol = p.symbol
     where p.account_id = p_account_id;
end;
$$;

-- Re-assert privileges: CREATE OR REPLACE preserves them, but being explicit
-- here means a future copy of this file can't quietly widen access.
revoke all on function public._apply_fill(uuid, text, text, numeric, numeric, uuid, integer)
    from public, anon, authenticated;
revoke all on function public.execute_market_order(uuid, text, text, numeric, interval)
    from public, anon;
grant execute on function public.execute_market_order(uuid, text, text, numeric, interval)
    to authenticated;
revoke all on function public.reset_account(uuid, numeric) from public, anon;
grant execute on function public.reset_account(uuid, numeric) to authenticated;
revoke all on function public.recompute_positions(uuid) from public, anon;
grant execute on function public.recompute_positions(uuid) to authenticated;
