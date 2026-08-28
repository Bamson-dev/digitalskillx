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
export type EnrollmentSource = "self" | "admin" | "purchase" | "enrollment_link";
export type EnrollmentLinkStatus = "draft" | "active" | "disabled" | "expired" | "deleted";
export type EnrollmentLinkAccess = "public" | "imported_students";
export type EnrollmentLinkRedirect =
  | "success_page"
  | "first_course"
  | "dashboard"
  | "specific_course";
export type SalesPageStatus = "draft" | "published" | "unpublished";
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
  | "program_course_added"
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
  | "account_created"
  | "customer_purchased"
  | "checkout_abandoned";

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
  /** Paid-program device login cap override. Null = platform default (4). */
  max_devices: number | null;
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
  community_telegram_url: string | null;
  community_whatsapp_url: string | null;
  /** Classroom companion — optional until migration 0035 applied. */
  companion_enabled?: boolean;
  /** Milestone celebrations — optional until migration 0035 applied. */
  celebrations_enabled?: boolean;
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
  is_coming_soon: boolean;
  coming_soon_available_at: string | null;
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
  course_id: string | null;
  learning_path_id: string | null;
  offer_id: string | null;
  bundle_id: string | null;
  digital_product_id: string | null;
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

export type CheckoutAbandonReminder = {
  id: string;
  transaction_id: string;
  student_id: string | null;
  email: string;
  sent_at: string;
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
  course_id: string | null;
  learning_path_id: string | null;
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

export type ProgramCoursePublishDelivery = {
  course_id: string;
  student_id: string;
  created_at: string;
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

export type ProductEvent = {
  id: string;
  created_at: string;
  event_name: string;
  course_id: string | null;
  student_id: string | null;
  metadata: Json;
};

export type AiConversation = Timestamps & {
  id: string;
  student_id: string;
  lesson_id: string | null;
  messages: Json;
  updated_at: string;
};

export type BulkImportJobStatus = "pending" | "processing" | "completed" | "failed";
export type BulkImportRowStatus =
  | "pending"
  | "processing"
  | "created"
  | "enrolled"
  | "skipped"
  | "failed";

export type BulkImportJob = {
  id: string;
  admin_id: string;
  default_course_id: string | null;
  status: BulkImportJobStatus;
  phase?: string;
  total_rows: number;
  processed_rows: number;
  created_count: number;
  enrolled_count: number;
  skipped_count: number;
  failed_count: number;
  emails_queued?: number;
  emails_sent?: number;
  emails_failed?: number;
  error_message: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type BulkImportRow = {
  id: string;
  job_id: string;
  row_number: number;
  full_name: string;
  email: string;
  course_ref: string;
  status: BulkImportRowStatus;
  reason: string | null;
  password_plain: string | null;
  processed_at: string | null;
  claimed_at?: string | null;
};

export type BulkImportEmailOutboxStatus = "pending" | "sending" | "sent" | "failed";
export type BulkImportEmailOutboxKind = "welcome" | "enrollment_notice";

export type BulkImportEmailOutbox = {
  id: string;
  job_id: string;
  row_id: string | null;
  student_id: string;
  email: string;
  full_name: string;
  course_title: string | null;
  password_plain: string | null;
  kind: BulkImportEmailOutboxKind;
  status: BulkImportEmailOutboxStatus;
  attempts: number;
  last_error: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EnrollmentLink = {
  id: string;
  token_hash: string;
  token_prefix: string;
  name: string;
  description: string;
  status: EnrollmentLinkStatus;
  access_type: EnrollmentLinkAccess;
  max_redemptions: number | null;
  current_redemptions: number;
  expires_at: string | null;
  redirect_type: EnrollmentLinkRedirect;
  redirect_course_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type EnrollmentLinkCourse = {
  id: string;
  enrollment_link_id: string;
  course_id: string;
  created_at: string;
};

export type EnrollmentLinkRedemption = {
  id: string;
  enrollment_link_id: string;
  user_id: string;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  browser: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  redeemed_at: string;
};

export type EnrollmentEvent = {
  id: string;
  enrollment_link_id: string | null;
  user_id: string | null;
  event: string;
  metadata: Json;
  request_id: string | null;
  correlation_id: string | null;
  created_at: string;
};

export type AccountSession = {
  id: string;
  user_id: string;
  session_token_hash: string;
  device_key: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  ip_address: string | null;
  user_agent: string | null;
  latitude: number | null;
  longitude: number | null;
  is_current: boolean;
  flagged_impossible_travel: boolean;
  last_active_at: string;
  created_at: string;
  revoked_at: string | null;
};

export type SalesPage = {
  id: string;
  course_id: string;
  title: string;
  status: SalesPageStatus;
  draft_schema: Json;
  published_schema: Json | null;
  draft_version: number;
  published_version: number;
  seo: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type SalesPageAsset = {
  id: string;
  sales_page_id: string;
  course_id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_provider: string;
  storage_path: string;
  public_url: string | null;
  checksum: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SalesPageImport = {
  id: string;
  sales_page_id: string;
  course_id: string;
  source_type: string;
  source_format: string;
  status: string;
  report: Json;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
};

export type SalesPageVersion = {
  id: string;
  sales_page_id: string;
  course_id: string;
  version: number;
  schema: Json;
  seo: Json;
  created_by: string | null;
  created_at: string;
};

export type SalesPageLead = {
  id: string;
  course_id: string;
  sales_page_id: string | null;
  email: string;
  full_name: string | null;
  consent: boolean;
  source: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

export type CourseRecommendationRow = {
  id: string;
  course_id: string;
  recommended_course_id: string;
  kind: "cross_sell" | "upsell" | "downsell" | "related";
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type TagCatalog = {
  id: string;
  slug: string;
  label: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerSegment = {
  id: string;
  name: string;
  description: string | null;
  definition: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseBundle = {
  id: string;
  title: string;
  description: string | null;
  price_ngn: number;
  price_usd: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseBundleItem = {
  id: string;
  bundle_id: string;
  course_id: string;
  sort_order: number;
};

export type CreatorProfile = {
  id: string;
  display_name: string;
  short_bio: string;
  expertise: string[];
  teaches: string;
  credentials: string;
  relevance: string;
  youtube_channel_id: string | null;
  youtube_channel_url: string | null;
  avatar_url: string | null;
  research_status: "pending" | "complete" | "partial" | "failed";
  created_at: string;
  updated_at: string;
};

export type CreatorSource = {
  id: string;
  creator_profile_id: string;
  source_type: "youtube_channel" | "website" | "linkedin" | "x" | "other" | "ai_synthesis";
  source_url: string;
  source_title: string;
  source_identifier: string | null;
  relationship: string;
  research_status: string;
  retrieved_at: string;
};

export type LearningPath = {
  id: string;
  slug: string;
  title: string;
  description: string;
  short_description: string;
  creator_profile_id: string | null;
  status: "draft" | "review" | "published" | "rejected" | "archived";
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  learning_objectives: string[];
  quality_score: number | null;
  quality_breakdown: Json;
  artwork_storage_path: string | null;
  artwork_public_url: string | null;
  artwork_status?:
    | "generated"
    | "processing"
    | "retrying"
    | "source_thumbnail"
    | "category_fallback"
    | "failed"
    | "missing"
    | null;
  artwork_source?: "openai" | "youtube" | "category" | "manual" | null;
  artwork_error?: string | null;
  artwork_updated_at?: string | null;
  estimated_duration_seconds?: number | null;
  source_playlist_id: string | null;
  source_playlist_url: string | null;
  source_playlist_title: string | null;
  youtube_channel_id: string | null;
  quiz_json: Json;
  assessment_json: Json;
  warnings: Json;
  seo_title: string | null;
  seo_description: string | null;
  certificate_enabled?: boolean;
  certificate_price_ngn?: number | null;
  certificate_pricing_mode?: "automatic" | "fixed" | "free";
  certificate_recommended_price_ngn?: number | null;
  certificate_price_reason?: string | null;
  recommended_course_id?: string | null;
  certificate_template_override?: string | null;
  published_course_id: string | null;
  factory_job_id: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  verification_status?: "pending" | "passed" | "verification_failed" | "retry" | null;
  verification_errors?: Json;
  verification_checked_at?: string | null;
  library_build_topic_id?: string | null;
};

export type LearningPathSection = {
  id: string;
  learning_path_id: string;
  title: string;
  position: number;
};

export type LearningPathLesson = {
  id: string;
  learning_path_id: string;
  section_id: string | null;
  title: string;
  original_title: string;
  youtube_video_id: string;
  youtube_url: string;
  summary: string;
  learning_objectives: string[];
  thumbnail_url: string | null;
  duration_seconds: number | null;
  position: number;
  source_metadata: Json;
};

export type LearningPathSource = {
  id: string;
  learning_path_id: string;
  source_type: "youtube_playlist" | "youtube_video" | "youtube_channel" | "website" | "other";
  source_url: string;
  source_title: string;
  source_identifier: string | null;
  relationship: string;
  retrieved_at: string;
};

export type ContentFactoryJob = {
  id: string;
  admin_id: string;
  input_type: "topic" | "playlist_url" | "playlist_id";
  input_value: string;
  status: "pending" | "processing" | "waiting_review" | "completed" | "failed" | "cancelled";
  phase: string;
  progress: number;
  learning_path_id: string | null;
  error_message: string | null;
  last_error: string | null;
  attempts: number;
  result_snapshot: Json;
  claimed_at: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type ContentFactoryDiscoveryRun = {
  id: string;
  admin_id: string;
  topic: string;
  target_generate: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  discovered_count: number;
  filtered_count: number;
  qualified_count: number;
  generated_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  library_topic_id?: string | null;
  library_build_mode?: "bulk" | "maintenance" | "expansion" | "continuous" | "manual" | null;
};

export type ContentFactoryCandidate = {
  id: string;
  run_id: string;
  playlist_id: string;
  channel_id: string | null;
  title: string;
  channel_title: string;
  item_count: number | null;
  thumbnail_url: string | null;
  topic: string;
  discovery_query: string;
  status:
    | "discovered"
    | "filtered"
    | "qualified"
    | "generating"
    | "review"
    | "rejected"
    | "published"
    | "blocked";
  rule_score: number | null;
  ai_score: number | null;
  score_breakdown: Json;
  filter_reason: string | null;
  learning_path_id: string | null;
  factory_job_id: string | null;
  created_at: string;
  updated_at: string;
  quality_status?: "pending" | "qualified" | "rejected" | "blocked_duplicate" | "failed" | null;
  quality_reason?: string | null;
  rejection_reason?: string | null;
  final_quality_score?: number | null;
  library_topic_id?: string | null;
};

export type LibraryBuildSettings = {
  id: string;
  target_published_count: number;
  build_mode: "bulk" | "maintenance" | "expansion" | "continuous" | "paused" | "stopped";
  run_status: "idle" | "running" | "paused" | "stopped" | "completed";
  quality_threshold: number;
  discovery_jobs_per_day: number;
  maintenance_max_per_week: number;
  maintenance_enabled: boolean;
  continuous_expansion_enabled: boolean;
  discovery_backlog_target: number;
  max_concurrent_discovery_jobs: number;
  qualification_batch_size: number;
  generation_batch_size: number;
  publication_batch_size: number;
  expansion_max_per_day: number;
  stall_recovery_minutes: number;
  last_maintenance_at: string | null;
  last_successful_activity_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  completed_at: string | null;
  candidates_today: number;
  approved_today: number;
  published_today: number;
  rejected_today: number;
  jobs_started_today: number;
  jobs_completed_today: number;
  jobs_failed_today: number;
  duplicates_blocked_total: number;
  rejected_candidates_total: number;
  failed_jobs_total: number;
  stats_day: string | null;
  next_topic_id: string | null;
  last_job_at: string | null;
  updated_at: string;
};

export type LibraryBuildCategory = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  priority_weight: number;
  minimum_coverage_goal: number;
  preferred_target: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LibraryBuildTopic = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  active: boolean;
  priority_weight: number;
  discovery_queries: Json;
  approved_course_count: number;
  published_course_count: number;
  target_coverage: number;
  last_searched_at: string | null;
  last_discovery_job_at: string | null;
  last_published_at: string | null;
  coverage_status: "unknown" | "needs_content" | "developing" | "good" | "strong" | "high_priority";
  created_at: string;
  updated_at: string;
};

export type LibraryBuildTopicCourse = {
  id: string;
  learning_path_id: string;
  topic_id: string;
  is_primary: boolean;
  created_at: string;
};

export type LibraryBuildDiscoveryJob = {
  id: string;
  mode: "bulk" | "maintenance" | "expansion" | "continuous";
  category_id: string | null;
  topic_id: string | null;
  discovery_run_id: string | null;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "rate_limited"
    | "quota_limited"
    | "paused"
    | "cancelled";
  search_queries: Json;
  candidates_found: number;
  candidates_rejected: number;
  candidates_qualified: number;
  candidates_duplicates: number;
  candidates_approved: number;
  courses_generated: number;
  courses_published: number;
  retry_count: number;
  error_message: string | null;
  sync_fingerprint: string | null;
  synced_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LibraryBuildActivity = {
  id: string;
  kind: string;
  message: string;
  details: Json;
  admin_id: string | null;
  created_at: string;
};

export type ContentFactoryBlock = {
  id: string;
  kind: "playlist_id" | "channel_id";
  value: string;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type AuthorityArticle = {
  id: string;
  title: string;
  slug: string;
  content_type:
    | "guide"
    | "tutorial"
    | "explainer"
    | "study_notes"
    | "lesson_summary"
    | "faq"
    | "glossary"
    | "practical_example"
    | "common_mistakes"
    | "comparison"
    | "prerequisites"
    | "next_steps";
  description: string;
  body_md: string;
  learning_path_id: string | null;
  category: string;
  target_intent: string;
  target_audience: string;
  related_lesson_ids: string[];
  related_lesson_titles: string[];
  seo_title: string | null;
  seo_description: string | null;
  status:
    | "idea"
    | "qualified"
    | "generating"
    | "review"
    | "approved"
    | "published"
    | "rejected"
    | "failed";
  quality_score: number | null;
  quality_breakdown: Json;
  opportunity_score: number;
  source_urls: string[];
  internal_links: Json;
  generation_meta: Json;
  word_count: number;
  stale_at: string | null;
  source_updated_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailSuppression = {
  id: string;
  email: string;
  reason: "unsubscribe" | "bounce" | "complaint" | "manual";
  source: string | null;
  created_at: string;
};

export type LearningPathProgress = {
  id: string;
  learning_path_id: string;
  lesson_id: string;
  student_id: string | null;
  device_key: string | null;
  completed_at: string;
  updated_at: string;
};

export type EmailCampaign = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "active" | "paused";
  total_steps: number;
  activated_at: string | null;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailCampaignRecipient = {
  id: string;
  campaign_id: string;
  email: string;
  profile_id: string | null;
  full_name: string | null;
  status: "active" | "completed" | "unsubscribed" | "failed";
  next_step: number;
  last_sent_step: number;
  last_sent_at: string | null;
  next_send_at: string;
  enrolled_at: string;
  completed_at: string | null;
  unsubscribed_at: string | null;
  failed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailCampaignSend = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  step_number: number;
  idempotency_key: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  attempts: number;
  provider_message_id: string | null;
  last_error: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
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
          Rel<"certificates_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">,
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
      program_course_publish_deliveries: Table<
        ProgramCoursePublishDelivery,
        [
          Rel<
            "program_course_publish_deliveries_course_id_fkey",
            "course_id",
            "courses",
            "id"
          >,
          Rel<
            "program_course_publish_deliveries_student_id_fkey",
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
      product_events: Table<ProductEvent>;
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
          Rel<"transactions_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">,
        ]
      >;
      checkout_abandon_reminders: Table<
        CheckoutAbandonReminder,
        [
          Rel<"checkout_abandon_reminders_transaction_id_fkey", "transaction_id", "transactions", "id">,
          Rel<"checkout_abandon_reminders_student_id_fkey", "student_id", "profiles", "id">,
        ]
      >;
      system_email_failures: Table<SystemEmailFailure, []>;
      bulk_import_jobs: Table<
        BulkImportJob,
        [
          Rel<"bulk_import_jobs_admin_id_fkey", "admin_id", "profiles", "id">,
          Rel<"bulk_import_jobs_default_course_id_fkey", "default_course_id", "courses", "id">,
        ]
      >;
      bulk_import_rows: Table<
        BulkImportRow,
        [Rel<"bulk_import_rows_job_id_fkey", "job_id", "bulk_import_jobs", "id">]
      >;
      bulk_import_email_outbox: Table<
        BulkImportEmailOutbox,
        [
          Rel<"bulk_import_email_outbox_job_id_fkey", "job_id", "bulk_import_jobs", "id">,
          Rel<"bulk_import_email_outbox_row_id_fkey", "row_id", "bulk_import_rows", "id">,
          Rel<"bulk_import_email_outbox_student_id_fkey", "student_id", "profiles", "id">,
        ]
      >;
      enrollment_links: Table<
        EnrollmentLink,
        [
          Rel<"enrollment_links_created_by_fkey", "created_by", "profiles", "id">,
          Rel<"enrollment_links_redirect_course_id_fkey", "redirect_course_id", "courses", "id">,
        ]
      >;
      enrollment_link_courses: Table<
        EnrollmentLinkCourse,
        [
          Rel<"enrollment_link_courses_enrollment_link_id_fkey", "enrollment_link_id", "enrollment_links", "id">,
          Rel<"enrollment_link_courses_course_id_fkey", "course_id", "courses", "id">,
        ]
      >;
      enrollment_link_redemptions: Table<
        EnrollmentLinkRedemption,
        [
          Rel<"enrollment_link_redemptions_enrollment_link_id_fkey", "enrollment_link_id", "enrollment_links", "id">,
          Rel<"enrollment_link_redemptions_user_id_fkey", "user_id", "profiles", "id">,
        ]
      >;
      enrollment_events: Table<
        EnrollmentEvent,
        [
          Rel<"enrollment_events_enrollment_link_id_fkey", "enrollment_link_id", "enrollment_links", "id">,
          Rel<"enrollment_events_user_id_fkey", "user_id", "profiles", "id">,
        ]
      >;
      account_sessions: Table<
        AccountSession,
        [Rel<"account_sessions_user_id_fkey", "user_id", "profiles", "id">]
      >;
      sales_pages: Table<
        SalesPage,
        [
          Rel<"sales_pages_course_id_fkey", "course_id", "courses", "id">,
          Rel<"sales_pages_created_by_fkey", "created_by", "profiles", "id">,
        ]
      >;
      sales_page_assets: Table<
        SalesPageAsset,
        [
          Rel<"sales_page_assets_sales_page_id_fkey", "sales_page_id", "sales_pages", "id">,
          Rel<"sales_page_assets_course_id_fkey", "course_id", "courses", "id">,
        ]
      >;
      sales_page_imports: Table<
        SalesPageImport,
        [
          Rel<"sales_page_imports_sales_page_id_fkey", "sales_page_id", "sales_pages", "id">,
          Rel<"sales_page_imports_course_id_fkey", "course_id", "courses", "id">,
          Rel<"sales_page_imports_created_by_fkey", "created_by", "profiles", "id">,
        ]
      >;
      sales_page_versions: Table<
        SalesPageVersion,
        [
          Rel<"sales_page_versions_sales_page_id_fkey", "sales_page_id", "sales_pages", "id">,
          Rel<"sales_page_versions_course_id_fkey", "course_id", "courses", "id">,
          Rel<"sales_page_versions_created_by_fkey", "created_by", "profiles", "id">,
        ]
      >;
      sales_page_leads: Table<
        SalesPageLead,
        [
          Rel<"sales_page_leads_course_id_fkey", "course_id", "courses", "id">,
          Rel<"sales_page_leads_sales_page_id_fkey", "sales_page_id", "sales_pages", "id">,
        ]
      >;
      course_recommendations: Table<
        CourseRecommendationRow,
        [
          Rel<"course_recommendations_course_id_fkey", "course_id", "courses", "id">,
          Rel<"course_recommendations_recommended_course_id_fkey", "recommended_course_id", "courses", "id">,
        ]
      >;
      tag_catalog: Table<
        TagCatalog,
        [Rel<"tag_catalog_created_by_fkey", "created_by", "profiles", "id">]
      >;
      customer_segments: Table<
        CustomerSegment,
        [Rel<"customer_segments_created_by_fkey", "created_by", "profiles", "id">]
      >;
      course_bundles: Table<
        CourseBundle,
        [Rel<"course_bundles_created_by_fkey", "created_by", "profiles", "id">]
      >;
      course_bundle_items: Table<
        CourseBundleItem,
        [
          Rel<"course_bundle_items_bundle_id_fkey", "bundle_id", "course_bundles", "id">,
          Rel<"course_bundle_items_course_id_fkey", "course_id", "courses", "id">,
        ]
      >;
      creator_profiles: Table<CreatorProfile>;
      creator_sources: Table<
        CreatorSource,
        [Rel<"creator_sources_creator_profile_id_fkey", "creator_profile_id", "creator_profiles", "id">]
      >;
      learning_paths: Table<
        LearningPath,
        [
          Rel<"learning_paths_creator_profile_id_fkey", "creator_profile_id", "creator_profiles", "id">,
          Rel<"learning_paths_created_by_fkey", "created_by", "profiles", "id">,
          Rel<"learning_paths_recommended_course_id_fkey", "recommended_course_id", "courses", "id">,
        ]
      >;
      learning_path_sections: Table<
        LearningPathSection,
        [Rel<"learning_path_sections_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">]
      >;
      learning_path_lessons: Table<
        LearningPathLesson,
        [
          Rel<"learning_path_lessons_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">,
          Rel<"learning_path_lessons_section_id_fkey", "section_id", "learning_path_sections", "id">,
        ]
      >;
      learning_path_sources: Table<
        LearningPathSource,
        [Rel<"learning_path_sources_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">]
      >;
      learning_path_progress: Table<
        LearningPathProgress,
        [
          Rel<"learning_path_progress_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">,
          Rel<"learning_path_progress_lesson_id_fkey", "lesson_id", "learning_path_lessons", "id">,
          Rel<"learning_path_progress_student_id_fkey", "student_id", "profiles", "id">,
        ]
      >;
      content_factory_jobs: Table<
        ContentFactoryJob,
        [
          Rel<"content_factory_jobs_admin_id_fkey", "admin_id", "profiles", "id">,
          Rel<"content_factory_jobs_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">,
        ]
      >;
      content_factory_discovery_runs: Table<
        ContentFactoryDiscoveryRun,
        [Rel<"content_factory_discovery_runs_admin_id_fkey", "admin_id", "profiles", "id">]
      >;
      content_factory_candidates: Table<
        ContentFactoryCandidate,
        [
          Rel<"content_factory_candidates_run_id_fkey", "run_id", "content_factory_discovery_runs", "id">,
          Rel<"content_factory_candidates_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">,
          Rel<"content_factory_candidates_factory_job_id_fkey", "factory_job_id", "content_factory_jobs", "id">,
        ]
      >;
      content_factory_blocks: Table<
        ContentFactoryBlock,
        [Rel<"content_factory_blocks_created_by_fkey", "created_by", "profiles", "id">]
      >;
      library_build_settings: Table<LibraryBuildSettings>;
      library_build_categories: Table<LibraryBuildCategory>;
      library_build_topics: Table<
        LibraryBuildTopic,
        [Rel<"library_build_topics_category_id_fkey", "category_id", "library_build_categories", "id">]
      >;
      library_build_discovery_jobs: Table<
        LibraryBuildDiscoveryJob,
        [
          Rel<"library_build_discovery_jobs_category_id_fkey", "category_id", "library_build_categories", "id">,
          Rel<"library_build_discovery_jobs_topic_id_fkey", "topic_id", "library_build_topics", "id">,
          Rel<
            "library_build_discovery_jobs_discovery_run_id_fkey",
            "discovery_run_id",
            "content_factory_discovery_runs",
            "id"
          >,
        ]
      >;
      library_build_activity: Table<
        LibraryBuildActivity,
        [Rel<"library_build_activity_admin_id_fkey", "admin_id", "profiles", "id">]
      >;
      library_build_topic_courses: Table<
        LibraryBuildTopicCourse,
        [
          Rel<"library_build_topic_courses_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">,
          Rel<"library_build_topic_courses_topic_id_fkey", "topic_id", "library_build_topics", "id">,
        ]
      >;
      authority_articles: Table<
        AuthorityArticle,
        [Rel<"authority_articles_learning_path_id_fkey", "learning_path_id", "learning_paths", "id">]
      >;
      email_suppressions: Table<EmailSuppression>;
      email_campaigns: Table<EmailCampaign>;
      email_campaign_recipients: Table<
        EmailCampaignRecipient,
        [
          Rel<"email_campaign_recipients_campaign_id_fkey", "campaign_id", "email_campaigns", "id">,
          Rel<"email_campaign_recipients_profile_id_fkey", "profile_id", "profiles", "id">,
        ]
      >;
      email_campaign_sends: Table<
        EmailCampaignSend,
        [
          Rel<"email_campaign_sends_campaign_id_fkey", "campaign_id", "email_campaigns", "id">,
          Rel<"email_campaign_sends_recipient_id_fkey", "recipient_id", "email_campaign_recipients", "id">,
        ]
      >;
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_enrolled: { Args: { p_course_id: string }; Returns: boolean };
      lesson_course_id: { Args: { p_lesson_id: string }; Returns: string };
      admin_get_service_role_key: { Args: Record<string, never>; Returns: string };
      reclaim_stale_bulk_import_rows: {
        Args: { p_older_than_minutes?: number };
        Returns: number;
      };
      claim_bulk_import_rows: {
        Args: { p_job_id: string; p_limit: number };
        Returns: BulkImportRow[];
      };
      claim_bulk_import_email_outbox: {
        Args: { p_limit?: number };
        Returns: BulkImportEmailOutbox[];
      };
      claim_email_campaign_sends: {
        Args: { p_limit?: number };
        Returns: EmailCampaignSend[];
      };
      reclaim_stale_email_campaign_sends: {
        Args: { p_older_than_minutes?: number };
        Returns: number;
      };
      claim_content_factory_jobs: {
        Args: { p_limit?: number };
        Returns: ContentFactoryJob[];
      };
      claim_enrollment_link_redemption: {
        Args: {
          p_link_id: string;
          p_user_id: string;
          p_email: string;
          p_ip?: string | null;
          p_user_agent?: string | null;
          p_browser?: string | null;
          p_device?: string | null;
          p_country?: string | null;
          p_city?: string | null;
        };
        Returns: Json;
      };
      list_course_publish_recipients: {
        Args: Record<string, never>;
        Returns: { id: string; email: string; full_name: string | null }[];
      };
    };
    Enums: {
      user_role: UserRole;
      course_visibility: CourseVisibility;
      enrollment_type: EnrollmentType;
      enrollment_source: EnrollmentSource;
      enrollment_link_status: EnrollmentLinkStatus;
      enrollment_link_access: EnrollmentLinkAccess;
      enrollment_link_redirect: EnrollmentLinkRedirect;
      sales_page_status: SalesPageStatus;
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
