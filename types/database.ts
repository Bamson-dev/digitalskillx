/**
 * Database types for the DigitalSkillX Supabase schema.
 *
 * Hand-authored to mirror `supabase/migrations`. Once a Supabase project is
 * connected, regenerate with:
 *   supabase gen types typescript --project-id <ref> > types/database.ts
 *
 * NOTE: Row shapes are `type` aliases (not interfaces) on purpose — supabase-js
 * requires rows to satisfy `Record<string, unknown>`, which TS interfaces do
 * not, while object-literal type aliases do.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "student";
export type CourseVisibility = "draft" | "published" | "archived";
export type EnrollmentType = "open" | "manual";
export type EnrollmentSource = "self" | "admin" | "purchase";
export type TransactionStatus = "pending" | "success" | "failed";
export type PaymentProvider = "paystack";
export type LessonType =
  | "video"
  | "pdf"
  | "text"
  | "audio"
  | "slides"
  | "download"
  | "embed";
export type QuizScope = "lesson" | "module";
export type QuestionType =
  | "mcq_single"
  | "mcq_multiple"
  | "true_false"
  | "short_answer"
  | "essay"
  | "file_upload";
export type ShowAnswersMode = "always" | "never" | "on_pass";
export type RetakeRule = "unlimited" | "limited" | "none";
export type SubmissionStatus = "pending" | "graded" | "revision_requested";
export type NotificationType =
  | "lesson_unlocked"
  | "quiz_graded"
  | "assignment_feedback"
  | "assignment_published"
  | "certificate_issued"
  | "announcement"
  | "enrollment";
export type AutomationTrigger =
  | "lesson_completed"
  | "quiz_passed"
  | "quiz_failed"
  | "course_completed"
  | "course_enrolled"
  | "student_inactive"
  | "account_created";

type Timestamps = { created_at: string };

/**
 * A foreign-key relationship descriptor, in the shape postgrest-js uses to
 * resolve embedded resource (`table(...)`) selects.
 */
type Rel<
  Fk extends string,
  Col extends string,
  RefRel extends string,
  RefCol extends string,
  OneToOne extends boolean = false,
> = {
  foreignKeyName: Fk;
  columns: [Col];
  isOneToOne: OneToOne;
  referencedRelation: RefRel;
  referencedColumns: [RefCol];
};

/**
 * Helper: build the {Row, Insert, Update, Relationships} shape supabase-js
 * expects. Pass relationships to enable typed embedded selects.
 */
type Table<
  Row extends Record<string, unknown>,
  Rels extends readonly unknown[] = [],
> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Rels;
};

export type Profile = Timestamps & {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  is_suspended: boolean;
  tags: string[];
  last_active_at: string | null;
  welcome_email_sent_at: string | null;
  updated_at: string;
};

export type CourseCategory = Timestamps & {
  id: string;
  name: string;
  slug: string | null;
  template_key: string | null;
};

export type CertificateTemplate = Timestamps & {
  id: string;
  name: string;
  template_key: string | null;
  html_template: string | null;
  base_image_url: string | null;
  is_default: boolean;
};

export type Course = Timestamps & {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  category_id: string | null;
  visibility: CourseVisibility;
  is_published: boolean;
  enrollment_type: EnrollmentType;
  certificate_enabled: boolean;
  certificate_template_id: string | null;
  certificate_template_override: string | null;
  required_completion_pct: number;
  drip_enabled: boolean;
  tags: string[];
  created_by: string | null;
  price_ngn: number;
  price_usd: number;
  short_description: string | null;
  learning_outcomes: string[];
  instructor_name: string | null;
  instructor_bio: string | null;
  promo_video_url: string | null;
  is_coming_soon: boolean;
  updated_at: string;
};

export type Module = Timestamps & {
  id: string;
  course_id: string;
  title: string;
  position: number;
  updated_at: string;
};

export type Lesson = Timestamps & {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  lesson_type: LessonType;
  content_url: string | null;
  content_text: string | null;
  is_locked: boolean;
  is_free_preview: boolean;
  required_watch_pct: number;
  drip_days: number | null;
  drip_date: string | null;
  position: number;
  duration_seconds: number | null;
  youtube_video_id: string | null;
  updated_at: string;
};

export type Enrollment = {
  id: string;
  student_id: string;
  course_id: string;
  enrolled_at: string;
  completed_at: string | null;
  enrolled_by: string | null;
  source: EnrollmentSource;
  completion_email_sent_at: string | null;
  idle_reminder_sent_at: string | null;
  milestone_25_email_sent_at: string | null;
  milestone_50_email_sent_at: string | null;
  milestone_75_email_sent_at: string | null;
};

export type Transaction = Timestamps & {
  id: string;
  student_id: string | null;
  course_id: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  reference: string;
  status: TransactionStatus;
  paystack_data: Json | null;
  anonymized: boolean;
  receipt_email_sent_at: string | null;
  updated_at: string;
};

export type SystemEmailFailure = {
  id: string;
  email_type: string;
  recipient: string;
  subject: string;
  payload: Json;
  error_message: string;
  created_at: string;
};

export type SupportRequest = Timestamps & {
  id: string;
  student_id: string | null;
  email: string | null;
  message: string;
  status: "open" | "in_progress" | "resolved";
};

export type RateLimitBucket = {
  bucket_key: string;
  request_count: number;
  window_start: string;
};

export type PlatformSettings = {
  id: string;
  platform_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  default_timezone: string;
  email_sender_name: string | null;
  email_reply_to: string | null;
  default_certificate_template_id: string | null;
  default_certificate_template_key: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type PlatformSecrets = {
  id: string;
  youtube_api_key: string | null;
  deepseek_api_key: string | null;
  paystack_secret_key: string | null;
  supabase_service_role_key: string | null;
  zeptomail_smtp_password: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type LessonProgress = {
  id: string;
  student_id: string;
  lesson_id: string;
  completed: boolean;
  watch_percentage: number;
  completed_at: string | null;
  updated_at: string;
};

export type Quiz = Timestamps & {
  id: string;
  scope: QuizScope;
  lesson_id: string | null;
  module_id: string | null;
  title: string;
  pass_score: number;
  time_limit_mins: number | null;
  retake_rule: RetakeRule;
  retake_limit: number | null;
  randomize_questions: boolean;
  randomize_answers: boolean;
  negative_marking: boolean;
  show_answers_on: ShowAnswersMode;
  updated_at: string;
};

export type QuizQuestion = {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: QuestionType;
  position: number;
  points: number;
};

export type QuizAnswer = {
  id: string;
  question_id: string;
  answer_text: string;
  is_correct: boolean;
  position: number;
};

export type QuizAttempt = {
  id: string;
  student_id: string;
  quiz_id: string;
  score: number | null;
  passed: boolean | null;
  responses: Json;
  started_at: string;
  submitted_at: string | null;
};

export type Certificate = {
  id: string;
  student_id: string;
  course_id: string;
  certificate_number: string;
  issued_at: string;
  completed_at: string | null;
  pdf_url: string | null;
  template_key: string | null;
  recipient_name: string | null;
  is_valid: boolean;
};

export type AssignmentStatus = "draft" | "published";

export type Assignment = Timestamps & {
  id: string;
  course_id: string;
  module_id: string | null;
  title: string;
  instructions: string | null;
  due_date: string | null;
  submission_types_allowed: string[];
  status: AssignmentStatus;
  published_at: string | null;
  updated_at: string;
};

export type AssignmentPublishDelivery = {
  assignment_id: string;
  student_id: string;
  notified_at: string;
};

export type AssignmentSubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  file_url: string | null;
  link_url: string | null;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
  status: SubmissionStatus;
  graded_by: string | null;
  graded_at: string | null;
};

export type AutomationRule = Timestamps & {
  id: string;
  name: string | null;
  trigger_event: AutomationTrigger;
  trigger_conditions: Json;
  actions: Json;
  is_active: boolean;
  updated_at: string;
};

export type Notification = Timestamps & {
  id: string;
  student_id: string;
  type: NotificationType;
  title: string | null;
  message: string;
  link_url: string | null;
  is_read: boolean;
};

export type Resource = Timestamps & {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  file_url: string;
  file_type: string | null;
  version: number;
  is_archived: boolean;
  download_allowed: boolean;
  position: number;
};

export type StudentNote = Timestamps & {
  id: string;
  student_id: string;
  lesson_id: string;
  content: string | null;
  updated_at: string;
};

export type Bookmark = Timestamps & {
  id: string;
  student_id: string;
  lesson_id: string;
  label: string | null;
  timestamp_seconds: number;
};

export type AdminNote = Timestamps & {
  id: string;
  admin_id: string | null;
  student_id: string;
  content: string;
};

export type AuditLog = Timestamps & {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Json;
};

export type AiConversation = Timestamps & {
  id: string;
  student_id: string;
  lesson_id: string | null;
  messages: Json;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      course_categories: Table<CourseCategory>;
      certificate_templates: Table<CertificateTemplate>;
      courses: Table<
        Course,
        [Rel<"courses_category_id_fkey", "category_id", "course_categories", "id">]
      >;
      modules: Table<
        Module,
        [Rel<"modules_course_id_fkey", "course_id", "courses", "id">]
      >;
      lessons: Table<
        Lesson,
        [Rel<"lessons_module_id_fkey", "module_id", "modules", "id">]
      >;
      enrollments: Table<
        Enrollment,
        [
          Rel<"enrollments_student_id_fkey", "student_id", "profiles", "id">,
          Rel<"enrollments_course_id_fkey", "course_id", "courses", "id">,
        ]
      >;
      lesson_progress: Table<
        LessonProgress,
        [
          Rel<"lesson_progress_student_id_fkey", "student_id", "profiles", "id">,
          Rel<"lesson_progress_lesson_id_fkey", "lesson_id", "lessons", "id">,
        ]
      >;
      quizzes: Table<
        Quiz,
        [
          Rel<"quizzes_lesson_id_fkey", "lesson_id", "lessons", "id">,
          Rel<"quizzes_module_id_fkey", "module_id", "modules", "id">,
        ]
      >;
      quiz_questions: Table<
        QuizQuestion,
        [Rel<"quiz_questions_quiz_id_fkey", "quiz_id", "quizzes", "id">]
      >;
      quiz_answers: Table<
        QuizAnswer,
        [Rel<"quiz_answers_question_id_fkey", "question_id", "quiz_questions", "id">]
      >;
      quiz_attempts: Table<
        QuizAttempt,
        [
          Rel<"quiz_attempts_student_id_fkey", "student_id", "profiles", "id">,
          Rel<"quiz_attempts_quiz_id_fkey", "quiz_id", "quizzes", "id">,
        ]
      >;
      certificates: Table<
        Certificate,
        [
          Rel<"certificates_student_id_fkey", "student_id", "profiles", "id">,
          Rel<"certificates_course_id_fkey", "course_id", "courses", "id">,
        ]
      >;
      assignments: Table<
        Assignment,
        [
          Rel<"assignments_course_id_fkey", "course_id", "courses", "id">,
          Rel<"assignments_module_id_fkey", "module_id", "modules", "id">,
        ]
      >;
      assignment_publish_deliveries: Table<
        AssignmentPublishDelivery,
        [
          Rel<
            "assignment_publish_deliveries_assignment_id_fkey",
            "assignment_id",
            "assignments",
            "id"
          >,
          Rel<
            "assignment_publish_deliveries_student_id_fkey",
            "student_id",
            "profiles",
            "id"
          >,
        ]
      >;
      assignment_submissions: Table<
        AssignmentSubmission,
        [
          Rel<
            "assignment_submissions_assignment_id_fkey",
            "assignment_id",
            "assignments",
            "id"
          >,
          Rel<
            "assignment_submissions_student_id_fkey",
            "student_id",
            "profiles",
            "id"
          >,
        ]
      >;
      automation_rules: Table<AutomationRule>;
      notifications: Table<Notification>;
      resources: Table<Resource>;
      student_notes: Table<StudentNote>;
      bookmarks: Table<Bookmark>;
      admin_notes: Table<AdminNote>;
      audit_logs: Table<AuditLog>;
      ai_conversations: Table<AiConversation>;
      support_requests: Table<
        SupportRequest,
        [Rel<"support_requests_student_id_fkey", "student_id", "profiles", "id">]
      >;
      rate_limit_buckets: Table<RateLimitBucket>;
      platform_settings: Table<
        PlatformSettings,
        [
          Rel<
            "platform_settings_default_certificate_template_id_fkey",
            "default_certificate_template_id",
            "certificate_templates",
            "id",
            true
          >,
          Rel<"platform_settings_updated_by_fkey", "updated_by", "profiles", "id", true>,
        ]
      >;
      platform_secrets: Table<
        PlatformSecrets,
        [Rel<"platform_secrets_updated_by_fkey", "updated_by", "profiles", "id", true>]
      >;
      transactions: Table<
        Transaction,
        [
          Rel<"transactions_student_id_fkey", "student_id", "profiles", "id">,
          Rel<"transactions_course_id_fkey", "course_id", "courses", "id">,
        ]
      >;
      system_email_failures: Table<SystemEmailFailure, []>;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_enrolled: { Args: { p_course_id: string }; Returns: boolean };
      lesson_course_id: { Args: { p_lesson_id: string }; Returns: string };
      admin_get_service_role_key: { Args: Record<string, never>; Returns: string };
    };
    Enums: {
      user_role: UserRole;
      course_visibility: CourseVisibility;
      enrollment_type: EnrollmentType;
      enrollment_source: EnrollmentSource;
      lesson_type: LessonType;
      quiz_scope: QuizScope;
      question_type: QuestionType;
      show_answers_mode: ShowAnswersMode;
      retake_rule: RetakeRule;
      submission_status: SubmissionStatus;
      assignment_status: AssignmentStatus;
      notification_type: NotificationType;
      automation_trigger: AutomationTrigger;
      transaction_status: TransactionStatus;
      payment_provider: PaymentProvider;
    };
    CompositeTypes: Record<string, never>;
  };
};
