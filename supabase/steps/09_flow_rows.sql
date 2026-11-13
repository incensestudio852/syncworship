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
