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
