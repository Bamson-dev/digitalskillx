-- Production stability: ensure all columns required by student/catalog/CSV paths exist.
-- Idempotent — safe to re-run.

-- 0024 course coming soon
alter table public.courses
  add column if not exists is_coming_soon boolean not null default false;

create index if not exists courses_coming_soon_idx
  on public.courses (is_coming_soon)
  where is_coming_soon = true;

comment on column public.courses.is_coming_soon is
  'When true, storefront shows a Coming Soon state and lesson access is blocked.';

drop policy if exists "enrollments: self-enroll open courses" on public.enrollments;
create policy "enrollments: self-enroll open courses" on public.enrollments
  for insert with check (
    student_id = auth.uid()
    and source = 'self'
    and exists (
      select 1 from public.courses c
      where c.id = course_id
        and c.enrollment_type = 'open'
        and c.visibility = 'published'
        and c.is_coming_soon = false
    )
  );

-- 0025 community links
alter table public.courses
  add column if not exists community_telegram_url text,
  add column if not exists community_whatsapp_url text;

comment on column public.courses.community_telegram_url is
  'Telegram group or channel invite link for enrolled students.';

comment on column public.courses.community_whatsapp_url is
  'WhatsApp community or group invite link for enrolled students.';

-- 0026 lesson coming soon
alter table public.lessons
  add column if not exists is_coming_soon boolean not null default false,
  add column if not exists coming_soon_available_at timestamptz;

create index if not exists lessons_coming_soon_idx
  on public.lessons (is_coming_soon)
  where is_coming_soon = true;

comment on column public.lessons.is_coming_soon is
  'When true, students see the lesson title but content shows a Coming Soon state.';

comment on column public.lessons.coming_soon_available_at is
  'Optional date shown to students for when lesson content is expected.';

-- 0023 milestone emails (safe if already applied)
alter table public.enrollments
  add column if not exists milestone_25_email_sent_at timestamptz,
  add column if not exists milestone_50_email_sent_at timestamptz,
  add column if not exists milestone_75_email_sent_at timestamptz;

-- 0021 certificate recipient
alter table public.certificates
  add column if not exists recipient_name text;
