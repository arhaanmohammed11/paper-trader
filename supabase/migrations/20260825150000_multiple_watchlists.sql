-- Named watchlists.
--
-- Previously every user had exactly one implicit list, enforced by
-- watchlist_items UNIQUE (user_id, symbol). This introduces real list objects
-- and moves that uniqueness to (watchlist_id, symbol), so the same symbol can
-- sit in "Tech" and "Earnings this week" at once.
--
-- The backfill below runs BEFORE the not-null constraint is added, so existing
-- rows are never orphaned.

create table if not exists public.watchlists (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users (id) on delete cascade,
    name        text not null check (char_length(name) between 1 and 40),
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists watchlists_user_idx
    on public.watchlists (user_id, sort_order, created_at);

-- Case-insensitive: "Tech" and "tech" would be confusing as separate lists.
create unique index if not exists watchlists_user_name_lower_idx
    on public.watchlists (user_id, lower(name));

alter table public.watchlists enable row level security;

drop policy if exists watchlists_own on public.watchlists;
create policy watchlists_own on public.watchlists
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete on public.watchlists to authenticated;

-- --------------------------------------------------------------- items ----

alter table public.watchlist_items
    add column if not exists watchlist_id uuid references public.watchlists (id) on delete cascade;

-- Backfill: give every user who already has items a default list, and move
-- their existing rows into it.
do $$
declare
    r record;
    v_list uuid;
begin
    for r in
        select distinct user_id from public.watchlist_items where watchlist_id is null
    loop
        insert into public.watchlists (user_id, name, sort_order)
             values (r.user_id, 'My Watchlist', 0)
        on conflict do nothing
          returning id into v_list;

        if v_list is null then
            select id into v_list
              from public.watchlists
             where user_id = r.user_id and lower(name) = 'my watchlist'
             limit 1;
        end if;

        update public.watchlist_items
           set watchlist_id = v_list
         where user_id = r.user_id and watchlist_id is null;

        v_list := null;
    end loop;
end $$;

alter table public.watchlist_items
    alter column watchlist_id set not null;

-- Uniqueness moves from the user to the list.
alter table public.watchlist_items
    drop constraint if exists watchlist_items_user_id_symbol_key;

create unique index if not exists watchlist_items_list_symbol_idx
    on public.watchlist_items (watchlist_id, symbol);

create index if not exists watchlist_items_list_order_idx
    on public.watchlist_items (watchlist_id, is_favourite desc, sort_order, symbol);

-- ----------------------------------------------------------- bootstrap ----

create or replace function public.get_or_create_default_watchlist()
returns public.watchlists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid  uuid := auth.uid();
    v_list public.watchlists;
begin
    if v_uid is null then
        raise exception 'Not authenticated' using errcode = 'PT001';
    end if;

    select * into v_list
      from public.watchlists
     where user_id = v_uid
     order by sort_order, created_at
     limit 1;

    if found then
        return v_list;
    end if;

    insert into public.watchlists (user_id, name)
         values (v_uid, 'My Watchlist')
      returning * into v_list;

    return v_list;
end;
$$;

revoke all on function public.get_or_create_default_watchlist() from public, anon;
grant execute on function public.get_or_create_default_watchlist() to authenticated;
