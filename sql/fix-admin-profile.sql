-- Fix admin login — run in the SAME Supabase project as Vercel NEXT_PUBLIC_SUPABASE_URL
-- (Dashboard → Project Settings → API → Project URL must match)

-- 1. Does the auth user exist?
select id, email, email_confirmed_at
from auth.users
where lower(email) = 'admin@digitalskillx.com';

-- 2. Create / promote admin profile (safe to re-run)
insert into public.profiles (id, email, full_name, role, is_suspended)
select id, email, 'Platform Admin', 'admin', false
from auth.users
where lower(email) = 'admin@digitalskillx.com'
on conflict (id) do update
set role = 'admin',
    email = excluded.email,
    is_suspended = false;

-- 3. Verify
select id, email, role, is_suspended
from public.profiles
where lower(email) = 'admin@digitalskillx.com';

-- If step 1 returns NO rows: the auth user does not exist in THIS project.
-- Run setup-production again or create the user in Authentication → Users.
