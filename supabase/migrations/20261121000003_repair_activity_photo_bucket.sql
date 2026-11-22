-- Repair projects where migration 000002 was recorded before its bucket statements reached the remote database.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-photos',
  'activity-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Upload own activity photos" on storage.objects;
drop policy if exists "Read own activity photos" on storage.objects;
drop policy if exists "Delete own activity photos" on storage.objects;

create policy "Upload own activity photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'activity-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Read own activity photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'activity-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Delete own activity photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'activity-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
