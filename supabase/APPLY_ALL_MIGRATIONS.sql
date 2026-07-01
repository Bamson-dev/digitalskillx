-- ============================================================================
-- 0001_init.sql
-- ============================================================================
-- ============================================================================
-- Pdigital MarketStore LMS — Initial Schema (Phase 1)
-- PRD §21. Single-tenant: one org (Pdigital), many courses, many students.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type user_role as enum ('admin', 'student');
create type course_visibility as enum ('draft', 'published', 'archived');
create type enrollment_type as enum ('open', 'manual');
create type enrollment_source as enum ('self', 'admin');
create type lesson_type as enum ('video', 'pdf', 'text', 'audio', 'slides', 'download', 'embed');
create type quiz_scope as enum ('lesson', 'module');
create type question_type as enum (
  'mcq_single', 'mcq_multiple', 'true_false', 'short_answer', 'essay', 'file_upload'
);
create type show_answers_mode as enum ('always', 'never', 'on_pass');
create type retake_rule as enum ('unlimited', 'limited', 'none');
create type submission_status as enum ('pending', 'graded', 'revision_requested');
create type notification_type as enum (
  'lesson_unlocked', 'quiz_graded', 'assignment_feedback',
  'certificate_issued', 'announcement', 'enrollment'
);
create type automation_trigger as enum (
  'lesson_completed', 'quiz_passed', 'quiz_failed', 'course_completed',
  'course_enrolled', 'student_inactive', 'account_created'
);

-- ----------------------------------------------------------------------------
-- Shared updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  email        text not null,
  role         user_role not null default 'student',
  avatar_url   text,
  is_suspended boolean not null default false,
  tags         text[] not null default '{}',
  last_active_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_tags_idx on public.profiles using gin (tags);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- course_categories (§19.2)
-- ----------------------------------------------------------------------------
create table public.course_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- certificate_templates
-- ----------------------------------------------------------------------------
create table public.certificate_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  html_template text,
  base_image_url text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- courses
-- ----------------------------------------------------------------------------
create table public.courses (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  description             text,
  thumbnail_url           text,
  category_id             uuid references public.course_categories (id) on delete set null,
  visibility              course_visibility not null default 'draft',
  is_published            boolean generated always as (visibility = 'published') stored,
  enrollment_type         enrollment_type not null default 'manual',
  certificate_enabled     boolean not null default false,
  certificate_template_id uuid references public.certificate_templates (id) on delete set null,
  required_completion_pct integer not null default 100 check (required_completion_pct between 0 and 100),
  drip_enabled            boolean not null default false,
  tags                    text[] not null default '{}',
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index courses_category_idx on public.courses (category_id);
create index courses_visibility_idx on public.courses (visibility);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- modules
-- ----------------------------------------------------------------------------
create table public.modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index modules_course_idx on public.modules (course_id, position);

create trigger modules_set_updated_at
  before update on public.modules
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- lessons
-- ----------------------------------------------------------------------------
create table public.lessons (
  id                 uuid primary key default gen_random_uuid(),
  module_id          uuid not null references public.modules (id) on delete cascade,
  title              text not null,
  description        text,
  lesson_type        lesson_type not null default 'video',
  content_url        text,
  content_text       text,
  is_locked          boolean not null default false,
  is_free_preview    boolean not null default false,
  required_watch_pct integer not null default 0 check (required_watch_pct between 0 and 100),
  drip_days          integer,
  drip_date          timestamptz,
  position           integer not null default 0,
  duration_seconds   integer,
  youtube_video_id   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index lessons_module_idx on public.lessons (module_id, position);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- enrollments
-- ----------------------------------------------------------------------------
create table public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  enrolled_by  uuid references public.profiles (id) on delete set null,
  source       enrollment_source not null default 'admin',
  unique (student_id, course_id)
);
create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_course_idx on public.enrollments (course_id);

-- ----------------------------------------------------------------------------
-- lesson_progress
-- ----------------------------------------------------------------------------
create table public.lesson_progress (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles (id) on delete cascade,
  lesson_id        uuid not null references public.lessons (id) on delete cascade,
  completed        boolean not null default false,
  watch_percentage integer not null default 0 check (watch_percentage between 0 and 100),
  completed_at     timestamptz,
  updated_at       timestamptz not null default now(),
  unique (student_id, lesson_id)
);
create index lesson_progress_student_idx on public.lesson_progress (student_id);

create trigger lesson_progress_set_updated_at
  before update on public.lesson_progress
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- quizzes
-- ----------------------------------------------------------------------------
create table public.quizzes (
  id                  uuid primary key default gen_random_uuid(),
  scope               quiz_scope not null default 'lesson',
  lesson_id           uuid references public.lessons (id) on delete cascade,
  module_id           uuid references public.modules (id) on delete cascade,
  title               text not null,
  pass_score          integer not null default 70 check (pass_score between 0 and 100),
  time_limit_mins     integer,
  retake_rule         retake_rule not null default 'unlimited',
  retake_limit        integer,
  randomize_questions boolean not null default false,
  randomize_answers   boolean not null default false,
  negative_marking    boolean not null default false,
  show_answers_on     show_answers_mode not null default 'on_pass',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (
    (scope = 'lesson' and lesson_id is not null) or
    (scope = 'module' and module_id is not null)
  )
);

create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- quiz_questions
-- ----------------------------------------------------------------------------
create table public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  question_text text not null,
  question_type question_type not null,
  position      integer not null default 0,
  points        numeric(6,2) not null default 1
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

-- ----------------------------------------------------------------------------
-- quiz_answers (choices)
-- ----------------------------------------------------------------------------
create table public.quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  answer_text text not null,
  is_correct  boolean not null default false,
  position    integer not null default 0
);
create index quiz_answers_question_idx on public.quiz_answers (question_id);

-- ----------------------------------------------------------------------------
-- quiz_attempts
-- ----------------------------------------------------------------------------
create table public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  quiz_id      uuid not null references public.quizzes (id) on delete cascade,
  score        numeric(6,2),
  passed       boolean,
  responses    jsonb not null default '{}'::jsonb,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz
);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id, quiz_id);

-- ----------------------------------------------------------------------------
-- certificates
-- ----------------------------------------------------------------------------
create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.profiles (id) on delete cascade,
  course_id          uuid not null references public.courses (id) on delete cascade,
  certificate_number text not null unique,
  issued_at          timestamptz not null default now(),
  completed_at       timestamptz,
  pdf_url            text,
  is_valid           boolean not null default true,
  unique (student_id, course_id)
);
create index certificates_number_idx on public.certificates (certificate_number);

-- ----------------------------------------------------------------------------
-- assignments
-- ----------------------------------------------------------------------------
create table public.assignments (
  id                       uuid primary key default gen_random_uuid(),
  module_id                uuid not null references public.modules (id) on delete cascade,
  title                    text not null,
  instructions             text,
  due_date                 timestamptz,
  submission_types_allowed text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- assignment_submissions
-- ----------------------------------------------------------------------------
create table public.assignment_submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  content       text,
  file_url      text,
  link_url      text,
  submitted_at  timestamptz not null default now(),
  grade         numeric(6,2),
  feedback      text,
  status        submission_status not null default 'pending',
  graded_by     uuid references public.profiles (id) on delete set null,
  graded_at     timestamptz
);
create index assignment_submissions_assignment_idx on public.assignment_submissions (assignment_id);
create index assignment_submissions_student_idx on public.assignment_submissions (student_id);

-- ----------------------------------------------------------------------------
-- automation_rules
-- ----------------------------------------------------------------------------
create table public.automation_rules (
  id                 uuid primary key default gen_random_uuid(),
  name               text,
  trigger_event      automation_trigger not null,
  trigger_conditions jsonb not null default '{}'::jsonb,
  actions            jsonb not null default '[]'::jsonb,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  type       notification_type not null,
  title      text,
  message    text not null,
  link_url   text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_student_idx on public.notifications (student_id, is_read);

-- ----------------------------------------------------------------------------
-- resources (§18)
-- ----------------------------------------------------------------------------
create table public.resources (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses (id) on delete cascade,
  lesson_id       uuid references public.lessons (id) on delete cascade,
  title           text not null,
  file_url        text not null,
  file_type       text,
  version         integer not null default 1,
  is_archived     boolean not null default false,
  download_allowed boolean not null default true,
  created_at      timestamptz not null default now()
);
create index resources_course_idx on public.resources (course_id);

-- ----------------------------------------------------------------------------
-- student_notes (§8.2)
-- ----------------------------------------------------------------------------
create table public.student_notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  content    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create trigger student_notes_set_updated_at
  before update on public.student_notes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- bookmarks (video timestamps, §8.2)
-- ----------------------------------------------------------------------------
create table public.bookmarks (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  lesson_id       uuid not null references public.lessons (id) on delete cascade,
  label           text,
  timestamp_seconds integer not null default 0,
  created_at      timestamptz not null default now()
);
create index bookmarks_student_lesson_idx on public.bookmarks (student_id, lesson_id);

-- ----------------------------------------------------------------------------
-- admin_notes (§5.1, admin-only notes on a student)
-- ----------------------------------------------------------------------------
create table public.admin_notes (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles (id) on delete set null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);
create index admin_notes_student_idx on public.admin_notes (student_id);

-- ----------------------------------------------------------------------------
-- audit_logs (§20)
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_admin_idx on public.audit_logs (admin_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ----------------------------------------------------------------------------
-- conversations (AI assistant history, §17 — optional in v1)
-- ----------------------------------------------------------------------------
create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id  uuid references public.lessons (id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_student_idx on public.ai_conversations (student_id, lesson_id);

create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();


-- ============================================================================
-- 0002_auth_helpers.sql
-- ============================================================================
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


-- ============================================================================
-- 0003_rls.sql
-- ============================================================================
-- ============================================================================
-- Row Level Security (PRD §4.3, §20)
-- Principle: students can only touch their own rows; admin has full access;
-- course content is readable only by enrolled students (or free previews).
-- ============================================================================

-- Enable RLS everywhere.
alter table public.profiles               enable row level security;
alter table public.course_categories      enable row level security;
alter table public.certificate_templates  enable row level security;
alter table public.courses                enable row level security;
alter table public.modules                enable row level security;
alter table public.lessons                enable row level security;
alter table public.enrollments            enable row level security;
alter table public.lesson_progress        enable row level security;
alter table public.quizzes                enable row level security;
alter table public.quiz_questions         enable row level security;
alter table public.quiz_answers           enable row level security;
alter table public.quiz_attempts          enable row level security;
alter table public.certificates           enable row level security;
alter table public.assignments            enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.automation_rules       enable row level security;
alter table public.notifications          enable row level security;
alter table public.resources              enable row level security;
alter table public.student_notes          enable row level security;
alter table public.bookmarks              enable row level security;
alter table public.admin_notes            enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.ai_conversations       enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- course_categories — readable by any authenticated user, managed by admin
-- ----------------------------------------------------------------------------
create policy "categories: read" on public.course_categories
  for select using (auth.role() = 'authenticated');
create policy "categories: admin all" on public.course_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- certificate_templates — admin only
-- ----------------------------------------------------------------------------
create policy "cert_templates: admin all" on public.certificate_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- courses — students read published, admin full
-- ----------------------------------------------------------------------------
create policy "courses: read published" on public.courses
  for select using (visibility = 'published' or public.is_enrolled(id));
create policy "courses: admin all" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- modules — readable when enrolled in parent course
-- ----------------------------------------------------------------------------
create policy "modules: read enrolled" on public.modules
  for select using (public.is_enrolled(course_id));
create policy "modules: admin all" on public.modules
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- lessons — readable when enrolled OR free preview
-- ----------------------------------------------------------------------------
create policy "lessons: read enrolled or preview" on public.lessons
  for select using (
    is_free_preview
    or public.is_enrolled((select course_id from public.modules where id = module_id))
  );
create policy "lessons: admin all" on public.lessons
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- enrollments — student reads own, admin full
-- ----------------------------------------------------------------------------
create policy "enrollments: read own" on public.enrollments
  for select using (student_id = auth.uid());
create policy "enrollments: self-enroll open courses" on public.enrollments
  for insert with check (
    student_id = auth.uid()
    and source = 'self'
    and exists (
      select 1 from public.courses c
      where c.id = course_id and c.enrollment_type = 'open' and c.visibility = 'published'
    )
  );
create policy "enrollments: admin all" on public.enrollments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- lesson_progress — student manages own, admin reads
-- ----------------------------------------------------------------------------
create policy "progress: rw own" on public.lesson_progress
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "progress: admin read" on public.lesson_progress
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- quizzes / questions / answers — readable when enrolled, admin full
-- ----------------------------------------------------------------------------
create policy "quizzes: read enrolled" on public.quizzes
  for select using (
    public.is_enrolled(
      coalesce(
        public.lesson_course_id(lesson_id),
        (select course_id from public.modules where id = module_id)
      )
    )
  );
create policy "quizzes: admin all" on public.quizzes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "quiz_questions: read enrolled" on public.quiz_questions
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_id)
  );
create policy "quiz_questions: admin all" on public.quiz_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- NOTE: answer correctness is filtered server-side before a quiz is submitted.
create policy "quiz_answers: read enrolled" on public.quiz_answers
  for select using (
    exists (select 1 from public.quiz_questions qq where qq.id = question_id)
  );
create policy "quiz_answers: admin all" on public.quiz_answers
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- quiz_attempts — student manages own, admin reads
-- ----------------------------------------------------------------------------
create policy "attempts: rw own" on public.quiz_attempts
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "attempts: admin read" on public.quiz_attempts
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- certificates — student reads own, admin full
-- (public verification uses the service-role server client)
-- ----------------------------------------------------------------------------
create policy "certificates: read own" on public.certificates
  for select using (student_id = auth.uid());
create policy "certificates: admin all" on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- assignments — readable when enrolled, admin full
-- ----------------------------------------------------------------------------
create policy "assignments: read enrolled" on public.assignments
  for select using (
    public.is_enrolled((select course_id from public.modules where id = module_id))
  );
create policy "assignments: admin all" on public.assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- assignment_submissions — student manages own, admin full
-- ----------------------------------------------------------------------------
create policy "submissions: rw own" on public.assignment_submissions
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "submissions: admin all" on public.assignment_submissions
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- automation_rules — admin only
-- ----------------------------------------------------------------------------
create policy "automation: admin all" on public.automation_rules
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- notifications — student reads/updates own, admin full
-- ----------------------------------------------------------------------------
create policy "notifications: read own" on public.notifications
  for select using (student_id = auth.uid());
create policy "notifications: update own" on public.notifications
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "notifications: admin all" on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- resources — readable when enrolled in course, admin full
-- ----------------------------------------------------------------------------
create policy "resources: read enrolled" on public.resources
  for select using (public.is_enrolled(course_id) and not is_archived);
create policy "resources: admin all" on public.resources
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- student_notes / bookmarks — student owns, admin none (private to learner)
-- ----------------------------------------------------------------------------
create policy "student_notes: rw own" on public.student_notes
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy "bookmarks: rw own" on public.bookmarks
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

-- ----------------------------------------------------------------------------
-- admin_notes / audit_logs — admin only
-- ----------------------------------------------------------------------------
create policy "admin_notes: admin all" on public.admin_notes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "audit_logs: admin all" on public.audit_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ai_conversations — student owns, admin reads
-- ----------------------------------------------------------------------------
create policy "ai_conv: rw own" on public.ai_conversations
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "ai_conv: admin read" on public.ai_conversations
  for select using (public.is_admin());


-- ============================================================================
-- 0004_storage.sql
-- ============================================================================
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


-- ============================================================================
-- 0005_marketplace.sql
-- ============================================================================
-- DigitalSkillX marketplace: course pricing, purchases, transactions (staging).

alter type enrollment_source add value if not exists 'purchase';

alter table public.courses
  add column if not exists price_ngn integer not null default 0 check (price_ngn >= 0),
  add column if not exists short_description text,
  add column if not exists learning_outcomes text[] not null default '{}',
  add column if not exists instructor_name text,
  add column if not exists instructor_bio text,
  add column if not exists promo_video_url text;

create type transaction_status as enum ('pending', 'success', 'failed');
create type payment_provider as enum ('paystack');

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  amount       integer not null check (amount > 0),
  currency     text not null default 'NGN',
  provider     payment_provider not null default 'paystack',
  reference    text not null unique,
  status       transaction_status not null default 'pending',
  paystack_data jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists transactions_student_idx on public.transactions (student_id);
create index if not exists transactions_course_idx on public.transactions (course_id);
create index if not exists transactions_reference_idx on public.transactions (reference);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

create policy "transactions: read own" on public.transactions
  for select using (student_id = auth.uid());

create policy "transactions: admin all" on public.transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- Published course outline (titles only) visible for marketing pages.
create policy "modules: read published course" on public.modules
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.visibility = 'published'
    )
  );

create policy "lessons: read published outline" on public.lessons
  for select using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.visibility = 'published'
    )
  );


-- ============================================================================
-- 0006_price_usd.sql
-- ============================================================================
-- Dual pricing: fixed USD price alongside Naira (staging).

alter table public.courses
  add column if not exists price_usd integer not null default 0 check (price_usd >= 0);


-- ============================================================================
-- 0007_launch_hardening.sql
-- ============================================================================
-- Launch hardening: support, rate limits, anonymized transactions.

create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete set null,
  email      text,
  message    text not null,
  status     text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_student_idx on public.support_requests (student_id);
create index if not exists support_requests_status_idx on public.support_requests (status);

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

create table if not exists public.rate_limit_buckets (
  bucket_key    text primary key,
  request_count integer not null default 0,
  window_start  timestamptz not null default now()
);

-- Allow transaction records to outlive deleted student accounts (accounting).
alter table public.transactions
  alter column student_id drop not null;

alter table public.transactions
  add column if not exists anonymized boolean not null default false;

alter table public.rate_limit_buckets enable row level security;
alter table public.support_requests enable row level security;

create policy "support: student insert own" on public.support_requests
  for insert with check (student_id = auth.uid());

create policy "support: student read own" on public.support_requests
  for select using (student_id = auth.uid());

create policy "support: admin all" on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());

create policy "rate_limits: service only" on public.rate_limit_buckets
  for all using (false);


