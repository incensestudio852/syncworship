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
