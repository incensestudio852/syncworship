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
