-- ============================================================================
-- Auth helpers: auto-create profile on signup + role helper functions
-- ============================================================================

-- Auto-create a profile row whenever a new auth user is created.
-- Pulls full_name from OAuth/signup metadata when present.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER avoids recursive RLS on profiles)
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments
    where course_id = p_course_id and student_id = auth.uid()
  );
$$;

-- Returns the course a lesson belongs to (for enrollment checks in RLS).
create or replace function public.lesson_course_id(p_lesson_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lesson_id;
$$;
