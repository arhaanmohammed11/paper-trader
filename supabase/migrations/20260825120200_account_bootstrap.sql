-- Paper Trader — account bootstrap.
--
-- Every SECURITY DEFINER function in this project MUST declare
-- `set search_path = public, pg_temp`. Without it the function is a privilege
-- escalation vector: a user-created schema earlier on the search path can
-- shadow `public` and capture the call.

create or replace function public.get_or_create_account()
returns public.accounts
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

    select * into v_acct
      from public.accounts
     where user_id = v_uid and name = 'Main';

    if found then
        return v_acct;
    end if;

    -- Idempotent under a double-submit: two concurrent calls race to insert,
    -- the loser hits the (user_id, name) unique index, and re-reads the winner.
    insert into public.accounts (user_id, name)
         values (v_uid, 'Main')
    on conflict (user_id, name) do nothing
      returning * into v_acct;

    if v_acct.id is null then
        select * into v_acct
          from public.accounts
         where user_id = v_uid and name = 'Main';
    end if;

    return v_acct;
end;
$$;

revoke all on function public.get_or_create_account() from public, anon;
grant execute on function public.get_or_create_account() to authenticated;
