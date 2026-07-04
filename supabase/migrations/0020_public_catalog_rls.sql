-- Ensure anonymous and authenticated users can read published courses (storefront catalog).
drop policy if exists "courses: read published" on public.courses;
create policy "courses: read published" on public.courses
  for select using (visibility = 'published' or public.is_enrolled(id));

-- Categories are public marketing metadata.
drop policy if exists "categories: read" on public.course_categories;
create policy "categories: read" on public.course_categories
  for select using (true);
