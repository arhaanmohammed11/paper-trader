-- User profiles.
--
-- Email and password live in auth.users and are changed through the Auth API,
-- never written here — duplicating them would create two sources of truth and
-- the copy would silently drift.
--
-- Everything below is a column the OWNER may write. That is deliberate and
-- different from `accounts`, where the money columns are revoked: a display
-- name has no integrity requirement, a cash balance does.

create table if not exists public.profiles (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    username    text unique
                check (username is null or username ~ '^[a-zA-Z0-9_]{3,20}$'),
    full_name   text check (full_name is null or char_length(full_name) <= 80),
    date_of_birth date check (
        date_of_birth is null
        or (date_of_birth > date '1900-01-01' and date_of_birth < current_date)
    ),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Case-insensitive uniqueness: "Arhaan" and "arhaan" must not both exist.
-- The plain UNIQUE above is case-sensitive and would let them.
create unique index if not exists profiles_username_lower_idx
    on public.profiles (lower(username))
    where username is not null;

alter table public.profiles enable row level security;

drop policy if exists profiles_own_read on public.profiles;
create policy profiles_own_read on public.profiles
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists profiles_own_insert on public.profiles;
create policy profiles_own_insert on public.profiles
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update on public.profiles to authenticated;

-- ------------------------------------------------------------- bootstrap ----

create or replace function public.get_or_create_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_row public.profiles;
begin
    if v_uid is null then
        raise exception 'Not authenticated' using errcode = 'PT001';
    end if;

    select * into v_row from public.profiles where user_id = v_uid;
    if found then
        return v_row;
    end if;

    insert into public.profiles (user_id)
         values (v_uid)
    on conflict (user_id) do nothing
      returning * into v_row;

    if v_row.user_id is null then
        select * into v_row from public.profiles where user_id = v_uid;
    end if;

    return v_row;
end;
$$;

revoke all on function public.get_or_create_profile() from public, anon;
grant execute on function public.get_or_create_profile() to authenticated;

-- Keep updated_at honest without trusting the client to send it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
    before update on public.profiles
    for each row execute function public.touch_updated_at();

-- ------------------------------------------------- watchlist favourites ----
-- The dashboard shows favourites first, so the flag lives next to the item.

alter table public.watchlist_items
    add column if not exists is_favourite boolean not null default false;

create index if not exists watchlist_favourite_idx
    on public.watchlist_items (user_id, is_favourite, sort_order);
