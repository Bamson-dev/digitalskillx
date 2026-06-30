-- ============================================================================
-- Storage buckets (PRD §6.3, §11, §18, §20)
-- ============================================================================

-- Public bucket: course thumbnails, avatars, certificate template base images.
insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- Private bucket: lesson uploads, resource files, assignment submissions, PDFs.
-- Access is granted via short-lived signed URLs from the server (§20).
insert into storage.buckets (id, name, public)
values ('private-files', 'private-files', false)
on conflict (id) do nothing;

-- Public assets: anyone can read; only admins can write.
create policy "public-assets: read" on storage.objects
  for select using (bucket_id = 'public-assets');
create policy "public-assets: admin write" on storage.objects
  for insert with check (bucket_id = 'public-assets' and public.is_admin());
create policy "public-assets: admin update" on storage.objects
  for update using (bucket_id = 'public-assets' and public.is_admin());
create policy "public-assets: admin delete" on storage.objects
  for delete using (bucket_id = 'public-assets' and public.is_admin());

-- Private files: admins manage; signed URLs are generated server-side, so no
-- broad student read policy is granted here.
create policy "private-files: admin all" on storage.objects
  for all using (bucket_id = 'private-files' and public.is_admin())
  with check (bucket_id = 'private-files' and public.is_admin());

-- Students may upload their own assignment files under a path prefixed
-- with their user id (e.g. submissions/<uid>/...).
create policy "private-files: student upload own" on storage.objects
  for insert with check (
    bucket_id = 'private-files'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
