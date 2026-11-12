create extension if not exists pg_trgm;

-- ===== TABLES =====
create table if not exists public.songs (
  id            uuid primary key default gen_random_uuid(),
  title         varchar not null,
  lyrics        text,                     -- inline chords as [G]word
  original_key  varchar(10),
  tags          text[],
  source        varchar,
  composer      varchar,
  lyricist      varchar,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists songs_title_trgm on public.songs using gin (title gin_trgm_ops);
create index if not exists songs_tags_gin   on public.songs using gin (tags);

create table if not exists public.song_sheets (
  id          uuid primary key default gen_random_uuid(),
  song_id     uuid not null references public.songs(id) on delete cascade,
  sheet_type  varchar(50) not null default 'page_image',   -- only 'page_image' is used
  file_url    text not null,              -- STORAGE PATH, never a signed URL
  page_number int not null default 1,
  created_at  timestamptz not null default now()
);
create index if not exists song_sheets_song on public.song_sheets (song_id, page_number);

create table if not exists public.worship_lists (
  id          uuid primary key default gen_random_uuid(),
  title       varchar not null,
  event_date  date not null,
  leader_name varchar,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.list_items (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references public.worship_lists(id) on delete cascade,
  song_id      uuid not null references public.songs(id) on delete cascade,
  selected_key varchar(10),
  sort_order   int not null default 0,
  notes        text,
  updated_at   timestamptz not null default now()
);
create index if not exists list_items_list on public.list_items (list_id, sort_order);

-- "whiteboard": the single source of truth for what is live in a list
create table if not exists public.live_state (
  list_id        uuid primary key references public.worship_lists(id) on delete cascade,
  active_song_id uuid references public.songs(id) on delete set null,
  pushed_by      uuid references auth.users(id),
  pushed_by_name text,
  updated_at     timestamptz not null default now()
);

-- ===== updated_at TRIGGERS =====
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists t_songs on public.songs;
create trigger t_songs before update on public.songs
  for each row execute function public.touch_updated_at();

drop trigger if exists t_lists on public.worship_lists;
create trigger t_lists before update on public.worship_lists
  for each row execute function public.touch_updated_at();

drop trigger if exists t_items on public.list_items;
create trigger t_items before update on public.list_items
  for each row execute function public.touch_updated_at();

drop trigger if exists t_live on public.live_state;
create trigger t_live before update on public.live_state
  for each row execute function public.touch_updated_at();

-- ===== LWW PUSH (server timestamp is authority) =====
create or replace function public.push_song(
  p_list_id uuid, p_song_id uuid, p_name text
) returns public.live_state
language plpgsql security definer set search_path = public as $$
declare r public.live_state;
begin
  insert into public.live_state (list_id, active_song_id, pushed_by, pushed_by_name)
  values (p_list_id, p_song_id, auth.uid(), p_name)
  on conflict (list_id) do update
    set active_song_id = excluded.active_song_id,
        pushed_by      = excluded.pushed_by,
        pushed_by_name = excluded.pushed_by_name,
        updated_at     = now()
    where public.live_state.updated_at <= now()
  returning * into r;
  return r;
end $$;
grant execute on function public.push_song(uuid, uuid, text) to authenticated;

-- ===== SEARCH (10k-safe) =====
create or replace function public.search_songs(q text, p_limit int default 20)
returns table (id uuid, title varchar, original_key varchar, tags text[])
language sql stable as $$
  select s.id, s.title, s.original_key, s.tags
  from public.songs s
  where s.title ilike '%' || coalesce(q, '') || '%'
  order by
    case when s.title ilike coalesce(q, '') || '%' then 0 else 1 end,
    s.title
  limit least(p_limit, 50);
$$;
grant execute on function public.search_songs(text, int) to authenticated;

-- ===== RLS: one role, all authenticated users equal =====
alter table public.songs         enable row level security;
alter table public.song_sheets   enable row level security;
alter table public.worship_lists enable row level security;
alter table public.list_items    enable row level security;
alter table public.live_state    enable row level security;

do $$ declare t text;
begin
  foreach t in array array['songs','song_sheets','worship_lists','list_items','live_state'] loop
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$s;', t);
    execute format(
      'create policy "auth_all_%1$s" on public.%1$s
       for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- ===== STORAGE: private bucket, signed URLs on read =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheets', 'sheets', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "sheets_auth_all" on storage.objects;
create policy "sheets_auth_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'sheets') with check (bucket_id = 'sheets');

-- ===== REALTIME =====
-- Wrapped so re-running the migration doesn't error on already-published tables.
do $$ begin
  begin
    alter publication supabase_realtime add table public.list_items;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.live_state;
  exception when duplicate_object then null; end;
end $$;

-- ===== HOUSEKEEPING: 03:00 HONG KONG TIME (HKT = UTC+8, no DST) =====
-- Requires pg_cron enabled from Dashboard → Database → Extensions.
select cron.unschedule('cleanup-worship-lists')
where exists (select 1 from cron.job where jobname = 'cleanup-worship-lists');

select cron.schedule('cleanup-worship-lists', '0 19 * * *', $$
  delete from public.worship_lists
  where event_date < ((now() at time zone 'Asia/Hong_Kong')::date - interval '3 months');
$$);
