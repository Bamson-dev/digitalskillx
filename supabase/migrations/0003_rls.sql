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
