-- Trade execution.
--
-- ############################################################################
-- ##  READ THIS BEFORE CHANGING execute_market_order                        ##
-- ##                                                                        ##
-- ##  It takes NO PRICE PARAMETER. That is not an oversight.                ##
-- ##                                                                        ##
-- ##  A SECURITY DEFINER function is callable directly over PostgREST:      ##
-- ##      POST /rest/v1/rpc/execute_market_order                            ##
-- ##  Any signed-in user can curl it with whatever body they like. If it    ##
-- ##  accepted `p_price`, they would send price = 0.01 and mint infinite    ##
-- ##  money. The UI being honest is irrelevant.                             ##
-- ##                                                                        ##
-- ##  So the price is read from quote_cache, which ONLY service_role may    ##
-- ##  write. Do not "simplify" this by passing a price in.                  ##
-- ############################################################################
--
-- Every function here is `security definer set search_path = public, pg_temp`.
-- Without the search_path, a user-created schema could shadow `public` and
-- capture the call — privilege escalation, not a style preference.
--
-- LOCK ORDERING: always accounts, then positions. Consistent ordering is what
-- prevents a deadlock between a user's market order and a concurrent cron fill.

-- ------------------------------------------------------- snapshot helper ----

create or replace function public.snapshot_account(
    p_account_id uuid,
    p_as_of      date default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_acct      public.accounts;
    v_date      date := coalesce(p_as_of, (now() at time zone 'utc')::date);
    v_positions numeric(20,4) := 0;
    v_realized  numeric(20,4) := 0;
begin
    select * into v_acct from public.accounts where id = p_account_id;
    if not found then return; end if;

    -- Positions valued at the last known price. A symbol with no cached quote
    -- falls back to its cost basis rather than vanishing from the total.
    select coalesce(sum(round(p.qty * coalesce(q.price, p.avg_cost), 4)), 0),
           coalesce(sum(p.realized_pnl), 0)
      into v_positions, v_realized
      from public.positions p
      left join public.quote_cache q on q.symbol = p.symbol
     where p.account_id = p_account_id and p.qty > 0;

    insert into public.portfolio_snapshots (
        account_id, user_id, as_of_date, cash, positions_value,
        equity, realized_pnl_to_date, net_deposits
    ) values (
        p_account_id, v_acct.user_id, v_date, v_acct.cash, v_positions,
        round(v_acct.cash + v_positions, 4), v_realized, v_acct.net_deposits
    )
    on conflict (account_id, as_of_date) do update
        set cash                 = excluded.cash,
            positions_value      = excluded.positions_value,
            equity               = excluded.equity,
            realized_pnl_to_date = excluded.realized_pnl_to_date,
            net_deposits         = excluded.net_deposits;
end;
$$;

-- --------------------------------------------------------- shared fill ----
-- The single place money moves. Market orders and (later) limit fills both
-- route through here so their rules cannot drift apart.

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
    -- LOCK 1: the account. Serializes two tabs each trying to spend the same
    -- cash — the classic double-submit bug.
    select * into v_acct from public.accounts
     where id = p_account_id for update;
    if not found then
        raise exception 'Account not found' using errcode = 'PT003';
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
            raise exception 'Insufficient funds: need %, have %', v_gross, v_acct.cash
                using errcode = 'PT005';
        end if;
        v_new_qty := v_pos.qty + p_qty;
        -- v_new_qty cannot be zero here (p_qty > 0 is enforced by the caller and
        -- by the table CHECK), but division is guarded anyway: a division-by-zero
        -- would abort the whole transaction.
        if v_new_qty = 0 then
            raise exception 'Invalid quantity' using errcode = 'PT002';
        end if;
        v_new_avg    := round((v_pos.qty * v_pos.avg_cost + v_gross) / v_new_qty, 6);
        v_cash_delta := -v_gross;
    else
        if p_qty > v_pos.qty then
            raise exception 'Insufficient shares: selling %, hold %', p_qty, v_pos.qty
                using errcode = 'PT006';
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

    -- Today's equity point, so a new account charts immediately instead of
    -- being empty until the end-of-day job runs.
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

-- ---------------------------------------------------- market order entry ----

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
        raise exception 'Not authenticated' using errcode = 'PT001';
    end if;

    if p_side not in ('buy','sell') then
        raise exception 'Side must be buy or sell' using errcode = 'PT002';
    end if;

    -- Whole shares in V1. The columns are numeric(20,8) so enabling fractional
    -- later is a one-line change here, not a migration.
    if p_qty is null or p_qty <= 0 or p_qty <> trunc(p_qty) then
        raise exception 'Quantity must be a whole number greater than zero'
            using errcode = 'PT002';
    end if;

    -- Ownership check. Without it, any signed-in user could trade in anyone
    -- else's account by passing its id.
    if not exists (
        select 1 from public.accounts
         where id = p_account_id and user_id = v_uid
    ) then
        raise exception 'Account not found' using errcode = 'PT003';
    end if;

    -- THE PRICE COMES FROM HERE, NOT FROM THE CALLER. See the header.
    select price, fetched_at into v_price, v_fetched
      from public.quote_cache
     where symbol = v_symbol;

    if v_price is null then
        raise exception 'No price available for %', v_symbol using errcode = 'PT004';
    end if;

    -- Refusing to trade on a stale quote is correct. Never fill at a price we
    -- cannot vouch for. (Note the provider's own quote is itself up to ~60s
    -- behind, so the window here is generous, not tight.)
    if now() - v_fetched > p_max_quote_age then
        raise exception 'Price for % is stale', v_symbol using errcode = 'PT004';
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

-- ----------------------------------------------------- account controls ----

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
        raise exception 'Not authenticated' using errcode = 'PT001';
    end if;

    if p_starting_cash is null or p_starting_cash < 100 or p_starting_cash > 100000000 then
        raise exception 'Starting cash must be between 100 and 100,000,000'
            using errcode = 'PT002';
    end if;

    select * into v_acct from public.accounts
     where id = p_account_id and user_id = v_uid for update;
    if not found then
        raise exception 'Account not found' using errcode = 'PT003';
    end if;

    -- Order matters: trades reference orders with ON DELETE RESTRICT, so trades
    -- must go first or the orders delete fails.
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

-- ------------------------------------------------------------ integrity ----
-- Replays the trade ledger and diffs it against `positions`, so correctness is
-- testable rather than assumed.

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
        raise exception 'Not authenticated' using errcode = 'PT001';
    end if;
    if not exists (
        select 1 from public.accounts where id = p_account_id and user_id = v_uid
    ) then
        raise exception 'Account not found' using errcode = 'PT003';
    end if;

    return query
    with ordered as (
        select t.symbol, t.side, t.qty, t.price,
               row_number() over (partition by t.symbol order by t.executed_at, t.id) as rn
          from public.trades t
         where t.account_id = p_account_id
    ),
    replay as (
        -- Average cost is path-dependent, so this is an ordered fold, not a
        -- GROUP BY. That is exactly why `positions` is a table, not a view.
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

-- ----------------------------------------------------------- privileges ----
-- _apply_fill must NOT be callable by users: it moves money with no ownership
-- check, trusting its caller to have done that.

revoke all on function public._apply_fill(uuid, text, text, numeric, numeric, uuid, integer)
    from public, anon, authenticated;
revoke all on function public.snapshot_account(uuid, date)
    from public, anon, authenticated;

revoke all on function public.execute_market_order(uuid, text, text, numeric, interval)
    from public, anon;
grant execute on function public.execute_market_order(uuid, text, text, numeric, interval)
    to authenticated;

revoke all on function public.reset_account(uuid, numeric) from public, anon;
grant execute on function public.reset_account(uuid, numeric) to authenticated;

revoke all on function public.recompute_positions(uuid) from public, anon;
grant execute on function public.recompute_positions(uuid) to authenticated;
