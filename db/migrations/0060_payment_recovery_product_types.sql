-- Generalise recovery groups to all DigitalSkillX payable products.
-- Existing course groups are backfilled without changing their identifiers or references.

alter table public.payment_recovery_groups
  add column if not exists product_type text,
  add column if not exists product_id text,
  add column if not exists product_context jsonb not null default '{}'::jsonb;

update public.payment_recovery_groups
set product_type = 'course',
    product_id = coalesce(course_id::text, id::text)
where product_type is null or product_id is null;

alter table public.payment_recovery_groups
  alter column product_type set default 'course',
  alter column product_type set not null,
  alter column product_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_recovery_groups_product_type_check'
      and conrelid = 'public.payment_recovery_groups'::regclass
  ) then
    alter table public.payment_recovery_groups
      add constraint payment_recovery_groups_product_type_check
      check (product_type in ('course','offer','bundle','certificate','digital_product','legacy'));
  end if;
end $$;

drop index if exists public.payment_recovery_groups_open_uidx;

create unique index if not exists payment_recovery_groups_open_product_uidx
  on public.payment_recovery_groups (lower(customer_email), product_type, product_id)
  where is_open;

create index if not exists payment_recovery_groups_product_idx
  on public.payment_recovery_groups (product_type, product_id, created_at desc);
