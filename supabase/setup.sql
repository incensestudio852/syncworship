-- ============================================================================
-- Sync Worship — complete database setup
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Safe to run more than once: every statement is idempotent.
--
-- Order matters internally (tables → functions → policies → triggers), but you
-- do not need to run anything separately.
--
-- NOT included on purpose:
--   * pg_cron cleanup (step 05) — guarded at the end, skipped if the extension
--     is absent rather than failing the run.
--   * step 11 (share_cards_fixup) — it repairs databases built by an older
--     step 10. A fresh install gets the correct schema from step 10 already.
-- ============================================================================

-- STEP 1 —— 先啟用 pg_trgm 擴充功能
-- 你的專案目前沒有這個 extension，這是 migration 失敗的唯一原因。
-- Dashboard → Database → Extensions 也可以手動啟用（搜尋 pg_trgm → Enable）。
create extension if not exists pg_trgm;

-- 確認結果（應顯示 pg_trgm）
select extname from pg_extension order by 1;

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

-- STEP 4 —— 開啟 Realtime（舞台即時同步必需）
-- 若報 "already member of publication"，代表已經開好了，可以忽略。
do $$
begin
  begin
    alter publication supabase_realtime add table public.list_items;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.live_state;
  exception when duplicate_object then null; end;
end $$;

-- 確認：應列出 list_items 與 live_state
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by 1;

-- Per-song OCR languages + sheet kind.
--
-- Why store these on the row:
--   * re-OCR is predictable — the same languages are reused for the same song
--   * the stage and the editor know whether chords exist without re-reading lyrics
--
-- `ocr_langs` holds the chosen OCR_LANGUAGES ids (e.g. {chi_tra,eng}).
-- `sheet_kind` records what the upload detected: chord_chart | lead_sheet | lyrics_only.

alter table public.songs
  add column if not exists ocr_langs text[] not null default array['chi_tra','chi_sim','eng'],
  add column if not exists sheet_kind text;

comment on column public.songs.ocr_langs is 'OCR language ids used for this song''s lyrics';
comment on column public.songs.sheet_kind is 'chord_chart | lead_sheet | lyrics_only';

-- ===== SEARCH v2: match title OR tags =====
--
-- The library page lets people filter by tag, so the RPC has to see tags.
-- A tag match uses the GIN index on songs.tags (`tags && array[q]`), which the
-- planner cannot use inside an OR with an ILIKE — so the tag branch is an
-- exact-match ANY() on the unnested array instead, which the index still serves
-- for the common case of a few hundred to a few thousand songs.
create or replace function public.search_songs(q text, p_limit int default 20)
returns table (id uuid, title varchar, original_key varchar, tags text[])
language sql stable as $$
  with needle as (select coalesce(trim(q), '') as v)
  select s.id, s.title, s.original_key, s.tags
  from public.songs s, needle n
  where n.v = ''
     or s.title ilike '%' || n.v || '%'
     or exists (select 1 from unnest(coalesce(s.tags, '{}')) t where t ilike '%' || n.v || '%')
  order by
    case when s.title ilike n.v || '%' then 0
         when s.title ilike '%' || n.v || '%' then 1
         else 2 end,
    s.title
  limit least(coalesce(p_limit, 20), 50);
$$;
grant execute on function public.search_songs(text, int) to authenticated;

-- ===== Distinct tags, for the filter chips =====
create or replace function public.song_tags()
returns table (tag text, n bigint)
language sql stable as $$
  select t as tag, count(*) as n
  from public.songs s, unnest(coalesce(s.tags, '{}')) t
  where t is not null and t <> ''
  group by t
  order by count(*) desc, t
  limit 60;
$$;
grant execute on function public.song_tags() to authenticated;

-- ===== SETLIST SETTINGS & FLOW =====
--
-- Adds the "arrangement" layer: a song knows its own defaults (tempo, dynamic,
-- flow), and each setlist entry can override them for that service. Transitions
-- live between entries, so a row with sort_order N sits in the gap after N.

-- ---- song-level defaults (auto-filled into the setlist) ----
alter table public.songs add column if not exists tempo int;
alter table public.songs add column if not exists dynamic smallint;   -- 1..10
alter table public.songs add column if not exists flow jsonb;         -- [{section, count}]

-- ---- per-setlist overrides ----
alter table public.list_items add column if not exists service_key  varchar(10);
alter table public.list_items add column if not exists tempo        int;
alter table public.list_items add column if not exists transition   varchar(40);
alter table public.list_items add column if not exists transition_note text;
alter table public.list_items add column if not exists dynamic      smallint;
alter table public.list_items add column if not exists flow         jsonb;
-- Remarks bound to a flow section: { section: 'C2', text: '...' }
alter table public.list_items add column if not exists flow_notes   jsonb;

comment on column public.list_items.selected_key is
  'Legacy label-only key. Superseded by service_key, which drives transposition.';
comment on column public.list_items.service_key is
  'Key the team sings in. NULL means use songs.original_key (no transposition).';
comment on column public.list_items.flow is
  'Ordered arrangement, e.g. [{"section":"Intro"},{"section":"V1"},{"section":"C","count":3}].';
comment on column public.list_items.dynamic is
  'Intensity 1-10. 1-3 quiet (blue), 4-6 building (amber), 7-10 full (red).';

-- Backfill service_key from the legacy label so nothing looks unset.
update public.list_items
set service_key = selected_key
where service_key is null and selected_key is not null;

-- ---- constraints (guarded: re-running this file must not fail) ----
do $$ begin
  alter table public.songs add constraint songs_dynamic_range
    check (dynamic is null or (dynamic between 1 and 10));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.list_items add constraint list_items_dynamic_range
    check (dynamic is null or (dynamic between 1 and 10));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.list_items add constraint list_items_tempo_range
    check (tempo is null or (tempo between 20 and 300));
exception when duplicate_object then null;
end $$;

-- ===== FLOW STEPS CARRY THEIR OWN DYNAMIC & REMARKS =====
--
-- A real worship flow sheet is a table: each row is one pass through a section
-- with its own intensity and its own remark. Storing dynamic/remarks per song
-- (or in a separate keyed object) loses the row structure and cannot express a
-- repeated section at two different intensities.
--
--   Intro      3        [Ab - Bb - Eb] Piano and second key on
--   V1         3        AG in
--   V1         4        Drum in
--   Cx2        3        Accent on the first beat
--
-- Flow therefore becomes an ordered array of rows:
--   [{ "section": "Intro", "count": 1, "dynamic": "3",  "remark": "..." },
--    { "section": "V2",    "count": 3, "dynamic": "5-7","remark": "" }]
--
-- `dynamic` is text, not an int, because real sheets use ranges ("5-7") and
-- single values ("8"); the UI renders both.

-- Song-level defaults stay, since a song usually opens at one intensity.
comment on column public.songs.dynamic is
  'Default intensity 1-10 or a range like 5-7, copied into a new flow row.';

-- Per-setlist song-level dynamic is now the *starting* value only; the authority
-- for a section's intensity is that row's own `dynamic`.
comment on column public.list_items.dynamic is
  'Overall/opening intensity. Per-section intensity lives in flow[].dynamic.';

-- flow_notes is superseded by flow[].remark — drop it to avoid two sources of
-- truth for the same remark.
alter table public.list_items drop column if exists flow_notes;

-- Existing rows that used the old {section,count} shape get explicit fields so
-- the UI never has to test for their absence.
update public.list_items
set flow = (
  select jsonb_agg(
           jsonb_build_object(
             'section', coalesce(step->>'section', ''),
             'count',   coalesce((step->>'count')::int, 1),
             'dynamic', coalesce(step->>'dynamic', ''),
             'remark',  coalesce(step->>'remark', '')
           )
           order by ord
         )
  from jsonb_array_elements(flow) with ordinality as t(step, ord)
)
where flow is not null
  and jsonb_typeof(flow) = 'array'
  and jsonb_array_length(flow) > 0
  and not (flow->0 ? 'remark');

-- supabase/steps/10_list_meta_and_sharing.sql
--
-- Adds the description field and the share-link table.
--
-- Design note: the LINK is login-walled (only the team account can open the
-- list itself), but the OG IMAGE is public — social platforms fetch it without
-- credentials, which is the whole point of a preview. So the share card is
-- produced by a narrow SECURITY DEFINER function that returns ONLY the fields
-- printed on the card (title, date, description, leader, song count). It never
-- returns lyrics or sheet paths, and it only answers for a valid, unrevoked code.

-- ---- 1. Description (used for both description and remarks) ----------------
alter table public.worship_lists
  add column if not exists description text;

-- ---- 1b. Public bucket for share cards -------------------------------------
-- The `sheets` bucket is PRIVATE on purpose: sheet images are licensed material
-- and must stay behind signed URLs. Share cards are the opposite — WhatsApp has
-- to fetch them with no credentials — so they live in their own public bucket
-- and nothing else is ever written there.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 2097152, array['image/png'])
on conflict (id) do update set public = true;

-- Only the authenticated app writes cards; anyone may read them.
drop policy if exists "auth write share cards" on storage.objects;
create policy "auth write share cards"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'share-cards');

drop policy if exists "auth update share cards" on storage.objects;
create policy "auth update share cards"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'share-cards');

drop policy if exists "public read share cards" on storage.objects;
create policy "public read share cards"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'share-cards');

-- ---- 2. Share links --------------------------------------------------------
create table if not exists public.list_shares (
  code        varchar(12) primary key,
  list_id     uuid not null references public.worship_lists(id) on delete cascade,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  -- Rendered share card. Rendered once at share time and re-rendered only when
  -- a field the card actually prints changes (name/date/description/leader).
  card_path   text,
  card_ver    timestamptz default now()
);
create index if not exists list_shares_list on public.list_shares (list_id);

-- RLS must be enabled BEFORE policies, or they are inert and anon can read
-- every row. This table is only ever touched by the authenticated app.
alter table public.list_shares enable row level security;

drop policy if exists "auth read shares"   on public.list_shares;
drop policy if exists "auth write shares"  on public.list_shares;
drop policy if exists "auth update shares" on public.list_shares;

create policy "auth read shares"
  on public.list_shares for select
  to authenticated using (true);

create policy "auth write shares"
  on public.list_shares for insert
  to authenticated with check (true);

create policy "auth update shares"
  on public.list_shares for update
  to authenticated using (true);

-- No DELETE policy on purpose: revoking sets revoked_at rather than deleting,
-- so a card already scraped by a social platform keeps resolving to a
-- "no longer shared" state instead of a 404 that looks like a broken link.

-- ---- 2b. Re-render trigger -------------------------------------------------
-- Adds a counter that changes ONLY when a printed field changes. `updated_at`
-- moves on every list edit, so it cannot be used: a song reorder would needlessly
-- re-render the card.
create or replace function public.bump_list_card_version()
returns trigger
language plpgsql
as $$
begin
  if new.title       is distinct from old.title
  or new.event_date  is distinct from old.event_date
  or new.leader_name is distinct from old.leader_name
  or new.description is distinct from old.description then
    update list_shares
       set card_ver = now()
     where list_id = new.id and revoked_at is null;
  end if;
  return new;
end $$;

drop trigger if exists list_card_version on public.worship_lists;
create trigger list_card_version
  after update on public.worship_lists
  for each row execute function public.bump_list_card_version();

-- Song count also changes the card. Count it in the same version stamp.
create or replace function public.bump_card_on_items()
returns trigger
language plpgsql
as $$
declare lid uuid;
begin
  lid := coalesce(new.list_id, old.list_id);
  update list_shares set card_ver = now() where list_id = lid and revoked_at is null;
  return coalesce(new, old);
end $$;

drop trigger if exists list_card_on_items on public.list_items;
create trigger list_card_on_items
  after insert or delete on public.list_items
  for each row execute function public.bump_card_on_items();

-- ---- 3. Public share-card lookup ------------------------------------------
-- Returns ONLY what the OG card draws. SECURITY DEFINER so anon can call it
-- without any table access; the WHERE clause is the sole gate.
create or replace function public.get_share_card(p_code text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'title',       w.title,
    'event_date',  w.event_date,
    'leader_name', w.leader_name,
    'description', w.description,
    'song_count',  (select count(*) from list_items i where i.list_id = w.id)
  )
  from list_shares sh
  join worship_lists w on w.id = sh.list_id
  where sh.code = p_code
    and sh.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_share_card(text) from public;
grant execute on function public.get_share_card(text) to anon, authenticated;

-- ---- 4. Create / revoke helpers (authenticated only) ----------------------
-- Returns json, not text, so the client gets the card version alongside the
-- code. Postgres refuses `create or replace` across a return-type change, so
-- the old signature is dropped first. Dropping a function never touches rows.
drop function if exists public.create_list_share(uuid);

create function public.create_list_share(p_list_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
        v_ver  timestamptz;
        v_path text;
begin
  -- Reuse an existing live share for this list rather than minting duplicates.
  select code, card_ver, card_path into v_code, v_ver, v_path
  from list_shares
  where list_id = p_list_id and revoked_at is null
  limit 1;

  if v_code is null then
    -- 12 chars from gen_random_uuid(), which is cryptographic in Postgres.
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    insert into list_shares (code, list_id) values (v_code, p_list_id)
    returning card_ver, card_path into v_ver, v_path;
  end if;

  return json_build_object('code', v_code, 'version', v_ver, 'card_path', v_path);
end $$;

revoke all on function public.create_list_share(uuid) from public;
grant execute on function public.create_list_share(uuid) to authenticated;

create or replace function public.revoke_list_share(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update list_shares
     set revoked_at = now()
   where code = p_code and revoked_at is null;
$$;

revoke all on function public.revoke_list_share(text) from public;
grant execute on function public.revoke_list_share(text) to authenticated;

-- supabase/steps/12_share_card_path.sql
--
-- Lets the app record where it stored the rendered share card, and returns that
-- path from get_share_card so the edge can put it in og:image.
--
-- Why this exists: the card is rendered in the browser (which has the user's own
-- CJK fonts) and uploaded to the public share-cards bucket. The Worker cannot
-- render Chinese itself — a Traditional-Chinese font is ~6 MB compressed, over
-- the size limit even before resvg — so it must reuse the stored PNG.
--
-- Safe to run repeatedly.

alter table public.list_shares add column if not exists card_path text;

-- Record the uploaded card path for a list's live share.
create or replace function public.set_share_card_path(p_list_id uuid, p_path text)
returns void
language sql
security definer
set search_path = public
as $$
  update list_shares
     set card_path = p_path,
         card_ver  = now()
   where list_id = p_list_id
     and revoked_at is null;
$$;

revoke all on function public.set_share_card_path(uuid, text) from public;
grant execute on function public.set_share_card_path(uuid, text) to authenticated;

-- get_share_card must expose the path; the return shape changes, so recreate.
drop function if exists public.get_share_card(text);

create function public.get_share_card(p_code text)
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'title',       w.title,
    'event_date',  w.event_date,
    'leader_name', w.leader_name,
    'description', w.description,
    'song_count',  (select count(*) from list_items i where i.list_id = w.id),
    'card_path',   sh.card_path
  )
  from list_shares sh
  join worship_lists w on w.id = sh.list_id
  where sh.code = p_code
    and sh.revoked_at is null
  limit 1;
$$;

revoke all on function public.get_share_card(text) from public;
grant execute on function public.get_share_card(text) to anon, authenticated;

-- ============================================================================
-- OPTIONAL: nightly cleanup of lists older than 3 months
--
-- Guarded: a project without pg_cron gets a notice, not an error, so the rest
-- of this file still completes. Enable pg_cron under Database → Extensions to
-- activate it.
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cleanup-worship-lists';
    perform cron.schedule('cleanup-worship-lists', '0 19 * * *', $cron$
      delete from public.worship_lists
      where event_date < ((now() at time zone 'Asia/Hong_Kong')::date - interval '3 months');
    $cron$);
    raise notice 'pg_cron cleanup scheduled (03:00 HKT nightly).';
  else
    raise notice 'pg_cron not installed — skipped scheduled cleanup. Enable it under Database -> Extensions, then re-run this block.';
  end if;
end $$;

-- ============================================================================
-- VERIFY — this should list every table and function the app needs.
-- ============================================================================
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public' and routine_type = 'FUNCTION'
order by routine_name;
