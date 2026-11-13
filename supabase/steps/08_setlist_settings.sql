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
