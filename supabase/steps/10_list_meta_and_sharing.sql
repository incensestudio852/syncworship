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
create or replace function public.create_list_share(p_list_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare new_code text;
begin
  -- Reuse an existing live share for this list rather than minting duplicates.
  select code into new_code
  from list_shares
  where list_id = p_list_id and revoked_at is null
  limit 1;

  if new_code is not null then
    return new_code;
  end if;

  -- 12 chars from a CSPRNG-ish source: enough that guessing a live code is
  -- impractical. gen_random_uuid() is cryptographic in Postgres.
  new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into list_shares (code, list_id) values (new_code, p_list_id);
  return new_code;
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
