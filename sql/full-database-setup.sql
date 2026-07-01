-- ============================================================================
-- DigitalSkillX — ONE PASTE SETUP (steps 3–7)
-- You already ran 0001 + 0002. Paste this ENTIRE file once in Supabase SQL Editor.
-- Safe to re-run if it failed halfway (uses DROP IF EXISTS).
-- ============================================================================

-- ── 0003 Row Level Security ───────────────────────────────────

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
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (id = auth.uid());
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles: admin all" on public.profiles;
create policy "profiles: admin all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- course_categories — readable by any authenticated user, managed by admin
-- ----------------------------------------------------------------------------
drop policy if exists "categories: read" on public.course_categories;
create policy "categories: read" on public.course_categories
  for select using (auth.role() = 'authenticated');
drop policy if exists "categories: admin all" on public.course_categories;
create policy "categories: admin all" on public.course_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- certificate_templates — admin only
-- ----------------------------------------------------------------------------
drop policy if exists "cert_templates: admin all" on public.certificate_templates;
create policy "cert_templates: admin all" on public.certificate_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- courses — students read published, admin full
-- ----------------------------------------------------------------------------
drop policy if exists "courses: read published" on public.courses;
create policy "courses: read published" on public.courses
  for select using (visibility = 'published' or public.is_enrolled(id));
drop policy if exists "courses: admin all" on public.courses;
create policy "courses: admin all" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- modules — readable when enrolled in parent course
-- ----------------------------------------------------------------------------
drop policy if exists "modules: read enrolled" on public.modules;
create policy "modules: read enrolled" on public.modules
  for select using (public.is_enrolled(course_id));
drop policy if exists "modules: admin all" on public.modules;
create policy "modules: admin all" on public.modules
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- lessons — readable when enrolled OR free preview
-- ----------------------------------------------------------------------------
drop policy if exists "lessons: read enrolled or preview" on public.lessons;
create policy "lessons: read enrolled or preview" on public.lessons
  for select using (
    is_free_preview
    or public.is_enrolled((select course_id from public.modules where id = module_id))
  );
drop policy if exists "lessons: admin all" on public.lessons;
create policy "lessons: admin all" on public.lessons
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- enrollments — student reads own, admin full
-- ----------------------------------------------------------------------------
drop policy if exists "enrollments: read own" on public.enrollments;
create policy "enrollments: read own" on public.enrollments
  for select using (student_id = auth.uid());
drop policy if exists "enrollments: self-enroll open courses" on public.enrollments;
create policy "enrollments: self-enroll open courses" on public.enrollments
  for insert with check (
    student_id = auth.uid()
    and source = 'self'
    and exists (
      select 1 from public.courses c
      where c.id = course_id and c.enrollment_type = 'open' and c.visibility = 'published'
    )
  );
drop policy if exists "enrollments: admin all" on public.enrollments;
create policy "enrollments: admin all" on public.enrollments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- lesson_progress — student manages own, admin reads
-- ----------------------------------------------------------------------------
drop policy if exists "progress: rw own" on public.lesson_progress;
create policy "progress: rw own" on public.lesson_progress
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "progress: admin read" on public.lesson_progress;
create policy "progress: admin read" on public.lesson_progress
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- quizzes / questions / answers — readable when enrolled, admin full
-- ----------------------------------------------------------------------------
drop policy if exists "quizzes: read enrolled" on public.quizzes;
create policy "quizzes: read enrolled" on public.quizzes
  for select using (
    public.is_enrolled(
      coalesce(
        public.lesson_course_id(lesson_id),
        (select course_id from public.modules where id = module_id)
      )
    )
  );
drop policy if exists "quizzes: admin all" on public.quizzes;
create policy "quizzes: admin all" on public.quizzes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "quiz_questions: read enrolled" on public.quiz_questions;
create policy "quiz_questions: read enrolled" on public.quiz_questions
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_id)
  );
drop policy if exists "quiz_questions: admin all" on public.quiz_questions;
create policy "quiz_questions: admin all" on public.quiz_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- NOTE: answer correctness is filtered server-side before a quiz is submitted.
drop policy if exists "quiz_answers: read enrolled" on public.quiz_answers;
create policy "quiz_answers: read enrolled" on public.quiz_answers
  for select using (
    exists (select 1 from public.quiz_questions qq where qq.id = question_id)
  );
drop policy if exists "quiz_answers: admin all" on public.quiz_answers;
create policy "quiz_answers: admin all" on public.quiz_answers
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- quiz_attempts — student manages own, admin reads
-- ----------------------------------------------------------------------------
drop policy if exists "attempts: rw own" on public.quiz_attempts;
create policy "attempts: rw own" on public.quiz_attempts
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "attempts: admin read" on public.quiz_attempts;
create policy "attempts: admin read" on public.quiz_attempts
  for select using (public.is_admin());

-- ----------------------------------------------------------------------------
-- certificates — student reads own, admin full
-- (public verification uses the service-role server client)
-- ----------------------------------------------------------------------------
drop policy if exists "certificates: read own" on public.certificates;
create policy "certificates: read own" on public.certificates
  for select using (student_id = auth.uid());
drop policy if exists "certificates: admin all" on public.certificates;
create policy "certificates: admin all" on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- assignments — readable when enrolled, admin full
-- ----------------------------------------------------------------------------
drop policy if exists "assignments: read enrolled" on public.assignments;
create policy "assignments: read enrolled" on public.assignments
  for select using (
    public.is_enrolled((select course_id from public.modules where id = module_id))
  );
drop policy if exists "assignments: admin all" on public.assignments;
create policy "assignments: admin all" on public.assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- assignment_submissions — student manages own, admin full
-- ----------------------------------------------------------------------------
drop policy if exists "submissions: rw own" on public.assignment_submissions;
create policy "submissions: rw own" on public.assignment_submissions
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "submissions: admin all" on public.assignment_submissions;
create policy "submissions: admin all" on public.assignment_submissions
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- automation_rules — admin only
-- ----------------------------------------------------------------------------
drop policy if exists "automation: admin all" on public.automation_rules;
create policy "automation: admin all" on public.automation_rules
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- notifications — student reads/updates own, admin full
-- ----------------------------------------------------------------------------
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications
  for select using (student_id = auth.uid());
drop policy if exists "notifications: update own" on public.notifications;
create policy "notifications: update own" on public.notifications
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "notifications: admin all" on public.notifications;
create policy "notifications: admin all" on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- resources — readable when enrolled in course, admin full
-- ----------------------------------------------------------------------------
drop policy if exists "resources: read enrolled" on public.resources;
create policy "resources: read enrolled" on public.resources
  for select using (public.is_enrolled(course_id) and not is_archived);
drop policy if exists "resources: admin all" on public.resources;
create policy "resources: admin all" on public.resources
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- student_notes / bookmarks — student owns, admin none (private to learner)
-- ----------------------------------------------------------------------------
drop policy if exists "student_notes: rw own" on public.student_notes;
create policy "student_notes: rw own" on public.student_notes
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "bookmarks: rw own" on public.bookmarks;
create policy "bookmarks: rw own" on public.bookmarks
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

-- ----------------------------------------------------------------------------
-- admin_notes / audit_logs — admin only
-- ----------------------------------------------------------------------------
drop policy if exists "admin_notes: admin all" on public.admin_notes;
create policy "admin_notes: admin all" on public.admin_notes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "audit_logs: admin all" on public.audit_logs;
create policy "audit_logs: admin all" on public.audit_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- ai_conversations — student owns, admin reads
-- ----------------------------------------------------------------------------
drop policy if exists "ai_conv: rw own" on public.ai_conversations;
create policy "ai_conv: rw own" on public.ai_conversations
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "ai_conv: admin read" on public.ai_conversations;
create policy "ai_conv: admin read" on public.ai_conversations
  for select using (public.is_admin());

-- ── 0004 Storage ──────────────────────────────────────────────

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
drop policy if exists "public-assets: read" on storage.objects;
create policy "public-assets: read" on storage.objects
  for select using (bucket_id = 'public-assets');
drop policy if exists "public-assets: admin write" on storage.objects;
create policy "public-assets: admin write" on storage.objects
  for insert with check (bucket_id = 'public-assets' and public.is_admin());
drop policy if exists "public-assets: admin update" on storage.objects;
create policy "public-assets: admin update" on storage.objects
  for update using (bucket_id = 'public-assets' and public.is_admin());
drop policy if exists "public-assets: admin delete" on storage.objects;
create policy "public-assets: admin delete" on storage.objects
  for delete using (bucket_id = 'public-assets' and public.is_admin());

-- Private files: admins manage; signed URLs are generated server-side, so no
-- broad student read policy is granted here.
drop policy if exists "private-files: admin all" on storage.objects;
create policy "private-files: admin all" on storage.objects
  for all using (bucket_id = 'private-files' and public.is_admin())
  with check (bucket_id = 'private-files' and public.is_admin());

-- Students may upload their own assignment files under a path prefixed
-- with their user id (e.g. submissions/<uid>/...).
drop policy if exists "private-files: student upload own" on storage.objects;
create policy "private-files: student upload own" on storage.objects
  for insert with check (
    bucket_id = 'private-files'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── 0005–0007 Marketplace + launch ─────────────────────────────

-- ── 0005_marketplace ──────────────────────────────────────────

alter type enrollment_source add value if not exists 'purchase';

alter table public.courses
  add column if not exists price_ngn integer not null default 0 check (price_ngn >= 0),
  add column if not exists short_description text,
  add column if not exists learning_outcomes text[] not null default '{}',
  add column if not exists instructor_name text,
  add column if not exists instructor_bio text,
  add column if not exists promo_video_url text;

do $$ begin
  create type transaction_status as enum ('pending', 'success', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_provider as enum ('paystack');
exception when duplicate_object then null;
end $$;

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

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

drop policy if exists "transactions: read own" on public.transactions;
create policy "transactions: read own" on public.transactions
  for select using (student_id = auth.uid());

drop policy if exists "transactions: admin all" on public.transactions;
create policy "transactions: admin all" on public.transactions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "modules: read published course" on public.modules;
create policy "modules: read published course" on public.modules
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.visibility = 'published'
    )
  );

drop policy if exists "lessons: read published outline" on public.lessons;
create policy "lessons: read published outline" on public.lessons
  for select using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.visibility = 'published'
    )
  );

-- ── 0006_price_usd ────────────────────────────────────────────

alter table public.courses
  add column if not exists price_usd integer not null default 0 check (price_usd >= 0);

-- ── 0007_launch_hardening ─────────────────────────────────────

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

drop trigger if exists support_requests_set_updated_at on public.support_requests;
create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

create table if not exists public.rate_limit_buckets (
  bucket_key    text primary key,
  request_count integer not null default 0,
  window_start  timestamptz not null default now()
);

alter table public.transactions
  alter column student_id drop not null;

alter table public.transactions
  add column if not exists anonymized boolean not null default false;

alter table public.rate_limit_buckets enable row level security;
alter table public.support_requests enable row level security;

drop policy if exists "support: student insert own" on public.support_requests;
create policy "support: student insert own" on public.support_requests
  for insert with check (student_id = auth.uid());

drop policy if exists "support: student read own" on public.support_requests;
create policy "support: student read own" on public.support_requests
  for select using (student_id = auth.uid());

drop policy if exists "support: admin all" on public.support_requests;
create policy "support: admin all" on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_limits: service only" on public.rate_limit_buckets;
create policy "rate_limits: service only" on public.rate_limit_buckets
  for all using (false);
