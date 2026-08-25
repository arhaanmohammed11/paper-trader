-- Saved chart drawings, per user per symbol.
--
-- Stored server-side rather than in localStorage so a trend line drawn on the
-- laptop is there on the phone — which is the whole reason this app is a
-- responsive web app rather than a desktop tool.
--
-- `overlays` is jsonb: an array of { name, points:[{timestamp,value}], styles,
-- lock, mode }. Deliberately NOT the raw klinecharts overlay object — that
-- carries `dataIndex` on every point, which is a position within the currently
-- loaded bars. Persisting it would put your lines in the wrong place the moment
-- you switched timeframe. Timestamp and value are absolute; dataIndex is not.

create table if not exists public.chart_drawings (
    user_id    uuid not null references auth.users (id) on delete cascade,
    symbol     text not null,
    overlays   jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (user_id, symbol),
    -- A runaway client shouldn't be able to store megabytes per symbol.
    constraint chart_drawings_size check (pg_column_size(overlays) < 262144),
    constraint chart_drawings_is_array check (jsonb_typeof(overlays) = 'array')
);

create index if not exists chart_drawings_user_idx
    on public.chart_drawings (user_id, updated_at desc);

alter table public.chart_drawings enable row level security;

drop policy if exists chart_drawings_own on public.chart_drawings;
create policy chart_drawings_own on public.chart_drawings
    for all to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update, delete on public.chart_drawings to authenticated;

drop trigger if exists chart_drawings_touch_updated_at on public.chart_drawings;
create trigger chart_drawings_touch_updated_at
    before update on public.chart_drawings
    for each row execute function public.touch_updated_at();
