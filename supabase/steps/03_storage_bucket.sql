-- ===== STORAGE: private bucket, signed URLs on read =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheets', 'sheets', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "sheets_auth_all" on storage.objects;
create policy "sheets_auth_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'sheets') with check (bucket_id = 'sheets');
