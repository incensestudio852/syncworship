-- supabase/steps/11_share_cards_fixup.sql
--
-- Repairs a database that ran an EARLIER version of step 10.
--
-- Step 10 used `create table if not exists`, so re-running it does not add
-- columns to a table that already exists — card_ver and card_path were silently
-- skipped, and everything downstream (triggers, card URLs) then failed.
-- This file adds whatever is missing. Safe to run repeatedly.

-- ---- 1. Columns the card feature needs -------------------------------------
alter table public.list_shares add column if not exists card_path text;
alter table public.list_shares add column if not exists card_ver  timestamptz default now();

-- ---- 2. Public bucket for rendered cards -----------------------------------
-- The `sheets` bucket stays private: licensed sheet images must not be exposed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('share-cards', 'share-cards', true, 2097152, array['image/png'])
on conflict (id) do update set public = true;

drop policy if exists "public read share cards" on storage.objects;
create policy "public read share cards"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'share-cards');

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

-- ---- 3. Version triggers ---------------------------------------------------
-- Stamps card_ver ONLY when a field the card prints changes. `updated_at` is
-- useless here: it moves on every edit, so a song reorder would re-render.
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

-- Song count is printed on the card, so adding/removing a song re-renders it.
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

-- ---- 4. create_list_share must return the version --------------------------
-- The earlier version returned `text`; this one returns `json`. Postgres refuses
-- `create or replace` when the return type changes, so the old function is
-- dropped first. Dropping a function does NOT touch data — list_shares rows stay.
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
  select code, card_ver, card_path into v_code, v_ver, v_path
  from list_shares
  where list_id = p_list_id and revoked_at is null
  limit 1;

  if v_code is null then
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    insert into list_shares (code, list_id) values (v_code, p_list_id)
    returning card_ver, card_path into v_ver, v_path;
  end if;

  return json_build_object('code', v_code, 'version', v_ver, 'card_path', v_path);
end $$;

revoke all on function public.create_list_share(uuid) from public;
grant execute on function public.create_list_share(uuid) to authenticated;
