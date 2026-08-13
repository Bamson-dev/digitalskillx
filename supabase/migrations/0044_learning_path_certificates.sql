-- Additive Stage 8: optional paid certificates + paid-course upsell on learning paths.
-- Does not DROP/TRUNCATE. Does not rewrite existing certificate or course rows.
-- Human approval remains the only publish path. AI cannot set prices or charge users.

alter table public.learning_paths
  add column if not exists certificate_enabled boolean not null default false;

alter table public.learning_paths
  add column if not exists certificate_price_ngn integer
    check (certificate_price_ngn is null or certificate_price_ngn >= 0);

alter table public.learning_paths
  add column if not exists recommended_course_id uuid references public.courses (id) on delete set null;

alter table public.learning_paths
  add column if not exists certificate_template_override text
    check (
      certificate_template_override is null
      or certificate_template_override in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

create index if not exists learning_paths_recommended_course_idx
  on public.learning_paths (recommended_course_id)
  where recommended_course_id is not null;

alter table public.certificates
  alter column course_id drop not null;

alter table public.certificates
  add column if not exists learning_path_id uuid references public.learning_paths (id) on delete restrict;

do $$ begin
  alter table public.certificates
    add constraint certificates_subject_check
    check (
      (course_id is not null and learning_path_id is null)
      or (course_id is null and learning_path_id is not null)
    );
exception when duplicate_object then null;
end $$;

create unique index if not exists certificates_student_learning_path_uidx
  on public.certificates (student_id, learning_path_id)
  where learning_path_id is not null;

create index if not exists certificates_learning_path_idx
  on public.certificates (learning_path_id)
  where learning_path_id is not null;

alter table public.transactions
  add column if not exists learning_path_id uuid references public.learning_paths (id) on delete set null;

alter table public.transactions
  drop constraint if exists transactions_commerce_target_check;

alter table public.transactions
  add constraint transactions_commerce_target_check
  check (
    course_id is not null
    or bundle_id is not null
    or digital_product_id is not null
    or learning_path_id is not null
  );

create index if not exists transactions_learning_path_idx
  on public.transactions (learning_path_id)
  where learning_path_id is not null;

-- RLS: no new public write policies.
-- certificates remain student-own SELECT + admin ALL (verify still uses service role).
-- learning_paths remain public SELECT for published rows only (offer fields are public).
-- transactions remain unchanged (no public client writes).
