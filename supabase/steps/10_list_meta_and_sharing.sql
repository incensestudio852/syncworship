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

-- ---- 2. Share links --------------------------------------------------------
create table if not exists public.list_shares (
  code        varchar(12) primary key,
  list_id     uuid not null references public.worship_lists(id) on delete cascade,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
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
