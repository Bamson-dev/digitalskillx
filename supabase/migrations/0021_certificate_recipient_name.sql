-- Store the display name printed on certificates (editable by admin, independent of profile).
alter table public.certificates
  add column if not exists recipient_name text;

comment on column public.certificates.recipient_name is
  'Name printed on the certificate PDF and public verify page. Defaults from profile at issue time; admin may edit and reissue.';

-- Backfill from profile names where missing.
update public.certificates c
set recipient_name = p.full_name
from public.profiles p
where c.student_id = p.id
  and c.recipient_name is null
  and p.full_name is not null
  and trim(p.full_name) <> '';
