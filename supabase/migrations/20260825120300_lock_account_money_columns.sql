-- Close a privilege hole: users could rewrite their own cash balance.
--
-- The original policy gave `accounts` a blanket `for all` to its owner, on the
-- reasoning that RLS scopes writes to your own row. It does — but your own row
-- is exactly where your money lives, so a plain
--
--     PATCH /rest/v1/accounts?id=eq.<mine>  {"cash": 999999}
--
-- succeeded. RLS answers "WHICH ROWS", never "WHICH COLUMNS"; the money columns
-- need a column-level GRANT, which is what this migration adds.
--
-- Verified before: cash went 100000 -> 999999 over plain PostgREST.
-- Verified after:  the same request is refused, 403 permission denied.

-- Split the blanket policy into select + a narrowly-granted update.
drop policy if exists accounts_own on public.accounts;

drop policy if exists accounts_own_read on public.accounts;
create policy accounts_own_read on public.accounts
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists accounts_own_update on public.accounts;
create policy accounts_own_update on public.accounts
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- No insert policy: accounts are created only by get_or_create_account(), which
-- is SECURITY DEFINER and therefore unaffected by everything below.
-- No delete policy: deleting an account would orphan its trade ledger.

revoke insert, update, delete on public.accounts from authenticated;

-- Renaming your account is harmless. cash / starting_cash / net_deposits are
-- deliberately absent from this grant — they move only through the RPCs.
grant update (name) on public.accounts to authenticated;
