insert into storage.buckets (id, name, public, file_size_limit)
values
  ('mahi-ai-attachments', 'mahi-ai-attachments', false, 26214400),
  ('mahi-ai-generated', 'mahi-ai-generated', false, 10485760)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Mahi AI users upload their own attachments" on storage.objects;
create policy "Mahi AI users upload their own attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mahi-ai-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Mahi AI users read their own attachments" on storage.objects;
create policy "Mahi AI users read their own attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'mahi-ai-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Mahi AI users delete their own attachments" on storage.objects;
create policy "Mahi AI users delete their own attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mahi-ai-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Mahi AI users read their own generated images" on storage.objects;
create policy "Mahi AI users read their own generated images"
on storage.objects for select to authenticated
using (
  bucket_id = 'mahi-ai-generated'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Mahi AI users delete their own generated images" on storage.objects;
create policy "Mahi AI users delete their own generated images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mahi-ai-generated'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
