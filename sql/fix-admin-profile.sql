-- Fix admin login: "This account does not have admin access"
-- Run in Supabase SQL Editor (PRODUCTION project linked to www.digitalskillx.com)

insert into public.profiles (id, email, full_name, role, is_suspended)
select id, email, 'Platform Admin', 'admin', false
from auth.users
where lower(email) = 'admin@digitalskillx.com'
on conflict (id) do update
set role = 'admin',
    email = excluded.email,
    is_suspended = false;

-- Verify:
select p.id, p.email, p.role, p.is_suspended
from public.profiles p
where lower(p.email) = 'admin@digitalskillx.com';
