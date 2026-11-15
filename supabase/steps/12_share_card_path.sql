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
