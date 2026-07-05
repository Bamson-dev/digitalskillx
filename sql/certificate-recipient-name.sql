-- Run in Supabase SQL Editor if certificates.recipient_name is missing.
alter table public.certificates
  add column if not exists recipient_name text;

update public.certificates c
set recipient_name = p.full_name
from public.profiles p
where c.student_id = p.id
  and c.recipient_name is null
  and p.full_name is not null
  and trim(p.full_name) <> '';
