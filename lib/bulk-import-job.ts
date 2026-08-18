import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCourseResolver,
  ensureImportedStudentProfile,
  generateStrongPassword,
  isValidStudentEmail,
  parseStudentCsv,
  resolveStudentIdByEmail,
  type CourseLookup,
} from "@/lib/admin-student-onboarding";
import { runAutomations } from "@/lib/automation";
import {
  countPendingOutboxForJob,
  drainBulkImportEmailOutboxUntilBudget,
  enqueueBulkImportEmail,
  getOutboxDiagnosticsForJob,
} from "@/lib/bulk-import-email-outbox";
import { bulkImportStage, timedStage } from "@/lib/bulk-import-telemetry";
import { isMissingColumnError } from "@/lib/schema-guard";
import type { BulkImportRow, BulkImportRowStatus, Database } from "@/types/database";

export const BULK_IMPORT_CHUNK_SIZE = 80;
export const BULK_IMPORT_ROW_CONCURRENCY = 8;
export const BULK_IMPORT_MAX_ROWS = 10_000;

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let next = 0;
  async function run() {
    while (next < items.length) {
      const current = items[next]!;
      next += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => run()));
}

export type BulkImportJobSummary = {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  phase?: string;
  totalRows: number;
  processedRows: number;
  created: number;
  enrolled: number;
  skipped: number;
  failed: number;
  emailsQueued?: number;
  emailsSent?: number;
  emailsFailed?: number;
  emailsPending?: number;
  emailsReady?: number;
  resendReady?: boolean;
  emailError?: string | null;
  errorMessage?: string | null;
  failures: Array<{ row: number; email: string; reason: string }>;
  done: boolean;
  pendingRows?: number;
  processingRows?: number;
};

/** Stored on bulk_import_jobs.error_message so re-uploads can email already-enrolled students without a new column. */
export const NOTIFY_ALREADY_ENROLLED_SENTINEL = "notify_already_enrolled";

function jobNotifiesAlreadyEnrolled(job: { error_message?: string | null }) {
  return job.error_message === NOTIFY_ALREADY_ENROLLED_SENTINEL;
}

function publicJobErrorMessage(message: string | null | undefined) {
  return message === NOTIFY_ALREADY_ENROLLED_SENTINEL ? null : message ?? null;
}

function jobsTableMissing(message: string) {
  return isMissingColumnError(message) || /bulk_import_jobs|relation .* does not exist/i.test(message);
}

function isTransientUpstreamError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("522") ||
    m.includes("connection timed out") ||
    m.includes("connection timeout") ||
    m.includes("upstream connect error") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("fetch failed") ||
    m.includes("socket hang up") ||
    m.includes("network") ||
    m.includes("<!doctype html>")
  );
}

async function withTransientRetry<T>(
  label: string,
  jobId: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!isTransientUpstreamError(message) || i === attempts - 1) throw err;
      bulkImportStage("transient_retry", {
        jobId,
        ok: false,
        error: `${label}: ${message.slice(0, 160)}`,
        attempt: i + 1,
      });
      await new Promise((r) => setTimeout(r, 750 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function createBulkImportJob(params: {
  admin: SupabaseClient<Database>;
  adminUserId: string;
  csvText: string;
  defaultCourseId: string | null;
  notifyAlreadyEnrolled?: boolean;
}): Promise<{ jobId: string; totalRows: number } | { fallbackRequired: true; reason: string }> {
  const parseStarted = Date.now();
  const { rows } = parseStudentCsv(params.csvText);
  bulkImportStage("parsing_finished", {
    ok: true,
    durationMs: Date.now() - parseStarted,
    rowCount: rows.length,
  });

  // Dedupe email+course within file (first wins) — matches sync path
  const seen = new Set<string>();
  const dataRows = rows.filter((r) => {
    if (!r.email && !r.fullName) return false;
    const email = r.email.trim().toLowerCase();
    if (!email) return true;
    const courseKey = (r.courseRef || params.defaultCourseId || "").trim().toLowerCase();
    const key = `${email}::${courseKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  bulkImportStage("duplicate_detection", {
    ok: true,
    rowCount: dataRows.length,
    rawRows: rows.length,
    dedupedAway: rows.filter((r) => r.email || r.fullName).length - dataRows.length,
  });

  if (dataRows.length === 0) {
    throw new Error("No data rows found in the CSV.");
  }
  if (dataRows.length > BULK_IMPORT_MAX_ROWS) {
    throw new Error(
      `CSV has ${dataRows.length} rows. Maximum is ${BULK_IMPORT_MAX_ROWS} per upload. Split the file and try again.`,
    );
  }

  const { data: job, error: jobError } = await params.admin
    .from("bulk_import_jobs")
    .insert({
      admin_id: params.adminUserId,
      default_course_id: params.defaultCourseId,
      status: "pending",
      total_rows: dataRows.length,
      phase: "queued",
      started_at: new Date().toISOString(),
      ...(params.notifyAlreadyEnrolled
        ? { error_message: NOTIFY_ALREADY_ENROLLED_SENTINEL }
        : {}),
    } as never)
    .select("id")
    .single();

  if (jobError) {
    // Retry without new columns if migration not applied
    if (/phase|started_at|emails_queued/i.test(jobError.message)) {
      const retry = await params.admin
        .from("bulk_import_jobs")
        .insert({
          admin_id: params.adminUserId,
          default_course_id: params.defaultCourseId,
          status: "pending",
          total_rows: dataRows.length,
          ...(params.notifyAlreadyEnrolled
            ? { error_message: NOTIFY_ALREADY_ENROLLED_SENTINEL }
            : {}),
        })
        .select("id")
        .single();
      if (retry.error) {
        if (jobsTableMissing(retry.error.message)) {
          return {
            fallbackRequired: true,
            reason:
              "Bulk import job tables are missing. Run sql/apply-production-stability.sql (or migration 0028).",
          };
        }
        throw new Error(retry.error.message);
      }
      const jobId = retry.data.id;
      await insertJobRows(params.admin, jobId, dataRows);
      bulkImportStage("job_created", { jobId, ok: true, rowCount: dataRows.length });
      return { jobId, totalRows: dataRows.length };
    }
    if (jobsTableMissing(jobError.message)) {
      return {
        fallbackRequired: true,
        reason:
          "Bulk import job tables are missing. Run sql/apply-production-stability.sql (or migration 0028).",
      };
    }
    throw new Error(jobError.message);
  }

  const jobId = job.id;
  await insertJobRows(params.admin, jobId, dataRows);
  bulkImportStage("job_created", { jobId, ok: true, rowCount: dataRows.length });
  return { jobId, totalRows: dataRows.length };
}

async function insertJobRows(
  admin: SupabaseClient<Database>,
  jobId: string,
  dataRows: Array<{ rowNumber: number; fullName: string; email: string; courseRef: string }>,
) {
  const payload = dataRows.map((row) => ({
    job_id: jobId,
    row_number: row.rowNumber,
    full_name: row.fullName,
    email: row.email,
    course_ref: row.courseRef,
    status: "pending" as const,
  }));

  for (let i = 0; i < payload.length; i += 500) {
    const slice = payload.slice(i, i + 500);
    const { error: rowsError } = await admin.from("bulk_import_rows").insert(slice);
    if (rowsError) {
      await admin.from("bulk_import_jobs").delete().eq("id", jobId);
      throw new Error(rowsError.message);
    }
  }
}

async function batchFindProfilesByEmails(
  admin: SupabaseClient<Database>,
  emails: string[],
) {
  const map = new Map<
    string,
    { id: string; full_name: string | null; email: string; is_suspended: boolean }
  >();
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, email, is_suspended")
      .in("email", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.email) map.set(row.email.trim().toLowerCase(), row);
    }
  }
  return map;
}

async function loadExistingEnrollmentKeys(
  admin: SupabaseClient<Database>,
  studentIds: string[],
  courseIds: string[],
) {
  const keys = new Set<string>();
  if (studentIds.length === 0 || courseIds.length === 0) return keys;
  const uniqueStudents = [...new Set(studentIds)];
  for (let i = 0; i < uniqueStudents.length; i += 200) {
    const slice = uniqueStudents.slice(i, i + 200);
    const { data, error } = await admin
      .from("enrollments")
      .select("student_id, course_id")
      .in("student_id", slice)
      .in("course_id", courseIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      keys.add(`${row.student_id}:${row.course_id}`);
    }
  }
  return keys;
}

async function fastBulkEnroll(
  admin: SupabaseClient<Database>,
  params: {
    studentId: string;
    courseId: string;
    enrolledBy: string;
    fullName: string;
    email: string;
  },
): Promise<boolean> {
  await ensureImportedStudentProfile(admin, {
    studentId: params.studentId,
    email: params.email,
    fullName: params.fullName,
  });
  const { error } = await admin.from("enrollments").insert({
    student_id: params.studentId,
    course_id: params.courseId,
    enrolled_by: params.enrolledBy,
    source: "admin",
  });
  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      return false;
    }
    throw new Error(error.message);
  }
  try {
    await runAutomations("course_enrolled", {
      studentId: params.studentId,
      courseId: params.courseId,
    });
  } catch (err) {
    bulkImportStage("automation_course_enrolled", {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return true;
}

async function countRowsByStatus(
  admin: SupabaseClient<Database>,
  jobId: string,
  status: BulkImportRowStatus,
) {
  const { count, error } = await admin
    .from("bulk_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", status);
  if (error) return 0;
  return count ?? 0;
}

/** Recount job counters from row statuses — race-safe under concurrent workers. */
async function recountAndPersistJobCounters(
  admin: SupabaseClient<Database>,
  jobId: string,
) {
  const [pending, processing, created, enrolled, skipped, failed] = await Promise.all([
    countRowsByStatus(admin, jobId, "pending"),
    countRowsByStatus(admin, jobId, "processing"),
    countRowsByStatus(admin, jobId, "created"),
    countRowsByStatus(admin, jobId, "enrolled"),
    countRowsByStatus(admin, jobId, "skipped"),
    countRowsByStatus(admin, jobId, "failed"),
  ]);
  const processed = created + enrolled + skipped + failed;
  const rowsDone = pending === 0 && processing === 0;

  await admin
    .from("bulk_import_jobs")
    .update({
      processed_rows: processed,
      created_count: created,
      enrolled_count: enrolled,
      skipped_count: skipped,
      failed_count: failed,
      status: "processing",
      phase: rowsDone ? "sending_emails" : "processing_rows",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", jobId);

  return { pending, processing, processed, created, enrolled, skipped, failed, rowsDone };
}

export async function reclaimStaleBulkImportClaims(
  admin: SupabaseClient<Database>,
  olderThanMinutes = 15,
) {
  const { data, error } = await admin.rpc("reclaim_stale_bulk_import_rows" as never, {
    p_older_than_minutes: olderThanMinutes,
  } as never);
  if (error) {
    bulkImportStage("reclaim_stale_claims", {
      ok: false,
      error: error.message,
    });
    return 0;
  }
  const n = typeof data === "number" ? data : 0;
  if (n > 0) {
    bulkImportStage("reclaim_stale_claims", { ok: true, rowCount: n });
  }
  return n;
}

/**
 * Process one chunk. When asWorker=true, skips admin ownership check (cron / service role).
 */
export async function processBulkImportChunk(params: {
  admin: SupabaseClient<Database>;
  adminUserId: string;
  jobId: string;
  chunkSize?: number;
  asWorker?: boolean;
}): Promise<BulkImportJobSummary> {
  const chunkSize = params.chunkSize ?? BULK_IMPORT_CHUNK_SIZE;
  const jobId = params.jobId;

  return timedStage("process_chunk", { jobId }, async () => {
    const { data: job, error: jobError } = await params.admin
      .from("bulk_import_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError) throw new Error(jobError.message);
    const jobRow = job;
    const notifyAlreadyEnrolled = jobNotifiesAlreadyEnrolled(jobRow);

    if (!params.asWorker && jobRow.admin_id !== params.adminUserId) {
      throw new Error("Forbidden.");
    }

    if (jobRow.status === "completed" || jobRow.status === "failed") {
      return getBulkImportJobSummary(params.admin, jobId);
    }

    await params.admin
      .from("bulk_import_jobs")
      .update({
        status: "processing",
        phase: jobRow.phase === "sending_emails" ? "sending_emails" : "processing_rows",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", jobId);

    let rows: BulkImportRow[] = [];
    const { data: claimedRpc, error: claimRpcError } = await params.admin.rpc(
      "claim_bulk_import_rows" as never,
      { p_job_id: jobId, p_limit: chunkSize } as never,
    );
    if (!claimRpcError && Array.isArray(claimedRpc)) {
      rows = claimedRpc as BulkImportRow[];
    } else {
      if (claimRpcError) {
        bulkImportStage("claim_rpc_fallback", {
          jobId,
          ok: false,
          error: claimRpcError.message,
        });
      }
      const { data: pendingRows, error: pendingError } = await params.admin
        .from("bulk_import_rows")
        .select("*")
        .eq("job_id", jobId)
        .eq("status", "pending")
        .order("row_number", { ascending: true })
        .limit(chunkSize);
      if (pendingError) throw new Error(pendingError.message);

      for (const row of pendingRows ?? []) {
        const { data: claimed, error: claimError } = await params.admin
          .from("bulk_import_rows")
          .update({
            status: "processing",
            // claimed_at used for stale reclaim (ignored if column missing)
            ...( { claimed_at: new Date().toISOString() } as Record<string, string>),
          } as never)
          .eq("id", row.id)
          .eq("status", "pending")
          .select("*")
          .maybeSingle();
        if (claimError) {
          // Retry without claimed_at for pre-migration DBs
          const retry = await params.admin
            .from("bulk_import_rows")
            .update({ status: "processing" })
            .eq("id", row.id)
            .eq("status", "pending")
            .select("*")
            .maybeSingle();
          if (retry.error) {
            rows = (pendingRows ?? []) as BulkImportRow[];
            break;
          }
          if (retry.data) rows.push(retry.data as BulkImportRow);
          continue;
        }
        if (claimed) rows.push(claimed as BulkImportRow);
      }
    }

    bulkImportStage("rows_claimed", { jobId, ok: true, rowCount: rows.length });

    if (rows.length === 0) {
      const pending = await countRowsByStatus(params.admin, jobId, "pending");
      const processing = await countRowsByStatus(params.admin, jobId, "processing");
      if (pending > 0 || processing > 0) {
        // Do NOT mark completed — reclaim may restore processing rows
        if (processing > 0) {
          await reclaimStaleBulkImportClaims(params.admin, 10);
        }
        bulkImportStage("chunk_empty_not_complete", {
          jobId,
          ok: true,
          pending,
          processing,
        });
        return getBulkImportJobSummary(params.admin, jobId);
      }

      const recounted = await recountAndPersistJobCounters(params.admin, jobId);
      if (recounted.rowsDone) {
        await maybeFinalizeJobPhase(params.admin, jobId);
      }
      bulkImportStage("chunk_empty_complete", {
        jobId,
        ok: true,
        processed: recounted.processed,
      });
      return getBulkImportJobSummary(params.admin, jobId);
    }

    const { data: courses, error: coursesError } = await params.admin
      .from("courses")
      .select("id, title")
      .order("title");
    if (coursesError) throw new Error(coursesError.message);
    const resolveCourse = buildCourseResolver((courses ?? []) as CourseLookup[]);

    const emails = rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
    const profileMap = await batchFindProfilesByEmails(params.admin, emails);
    const courseIdsForChunk = [
      ...new Set(
        rows
          .map((row) => resolveCourse(row.course_ref, jobRow.default_course_id).courseId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const enrolledKeys = await loadExistingEnrollmentKeys(
      params.admin,
      [...profileMap.values()].map((row) => row.id),
      courseIdsForChunk,
    );
    bulkImportStage("student_lookup_batch", {
      jobId,
      ok: true,
      rowCount: emails.length,
      found: profileMap.size,
    });

    const counters = { created: 0, enrolled: 0, skipped: 0, failed: 0 };
    const groups = new Map<string, BulkImportRow[]>();
    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      if (!email) {
        await markRow(params.admin, row.id, "failed", "Email is required on each row");
        counters.failed += 1;
        continue;
      }
      const list = groups.get(email) ?? [];
      list.push(row);
      groups.set(email, list);
    }

    await mapWithConcurrency(
      [...groups.entries()],
      BULK_IMPORT_ROW_CONCURRENCY,
      async ([email, groupRows]) => {
        for (const row of groupRows) {
          const fullName = row.full_name.trim();
          const rowStarted = Date.now();
          try {
            if (!isValidStudentEmail(email)) {
              await markRow(params.admin, row.id, "failed", "Invalid email format", email);
              counters.failed += 1;
              continue;
            }
            const name = fullName || email.split("@")[0] || "Student";
            const resolved = resolveCourse(row.course_ref, jobRow.default_course_id);
            if (resolved.error || !resolved.courseId) {
              await markRow(
                params.admin,
                row.id,
                "failed",
                resolved.error ?? "No course on row and no default course selected",
                email,
              );
              counters.failed += 1;
              continue;
            }

            let studentId: string | null = profileMap.get(email)?.id ?? null;
            let isNew = false;
            let password: string | null = null;

            const existing = profileMap.get(email);
            if (existing?.is_suspended) {
              await markRow(params.admin, row.id, "failed", "Student account is suspended", email);
              counters.failed += 1;
              continue;
            }

            if (!studentId) {
              password = generateStrongPassword();
              bulkImportStage("student_creation", { jobId, ok: true, email });
              let createError: { message: string } | null = null;
              let createdUserId: string | null = null;

              for (let attempt = 0; attempt < 3; attempt++) {
                const { data: createdUser, error } = await params.admin.auth.admin.createUser({
                  email,
                  password,
                  email_confirm: true,
                  user_metadata: { full_name: name },
                });
                if (!error && createdUser.user?.id) {
                  createdUserId = createdUser.user.id;
                  createError = null;
                  break;
                }
                createError = error ? { message: error.message } : { message: "User create failed" };
                const alreadyExists = /already|registered|exists/i.test(createError.message);
                if (alreadyExists || !isTransientUpstreamError(createError.message) || attempt === 2) {
                  break;
                }
                bulkImportStage("transient_retry", {
                  jobId,
                  ok: false,
                  error: `createUser: ${createError.message.slice(0, 160)}`,
                  attempt: attempt + 1,
                });
                await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
              }

              if (!createdUserId) {
                const recovered = await resolveStudentIdByEmail(params.admin, email);
                if (!recovered) {
                  await markRow(
                    params.admin,
                    row.id,
                    "failed",
                    createError?.message ?? "User create failed",
                    email,
                  );
                  counters.failed += 1;
                  continue;
                }
                studentId = recovered;
                await ensureImportedStudentProfile(params.admin, {
                  studentId,
                  email,
                  fullName: name,
                });
              } else {
                studentId = createdUserId;
                isNew = true;
                await ensureImportedStudentProfile(params.admin, {
                  studentId,
                  email,
                  fullName: name,
                });
                try {
                  await runAutomations("account_created", { studentId });
                } catch (err) {
                  bulkImportStage("automation_account_created", {
                    jobId,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
              }
            }

            if (!studentId) {
              await markRow(params.admin, row.id, "failed", "Could not resolve student account", email);
              counters.failed += 1;
              continue;
            }

            profileMap.set(email, {
              id: studentId,
              full_name: name,
              email,
              is_suspended: false,
            });

            const enrollKey = `${studentId}:${resolved.courseId}`;
            if (enrolledKeys.has(enrollKey)) {
              if (notifyAlreadyEnrolled) {
                await enqueueBulkImportEmail(params.admin, {
                  jobId,
                  rowId: row.id,
                  studentId,
                  email,
                  fullName: name,
                  courseTitle: resolved.courseTitle,
                  passwordPlain: null,
                  kind: "enrollment_notice",
                });
              }
              await markRow(
                params.admin,
                row.id,
                "skipped",
                notifyAlreadyEnrolled
                  ? "Already enrolled — enrollment email queued"
                  : "Already enrolled in this course",
                email,
              );
              counters.skipped += 1;
              continue;
            }

            const newlyEnrolled = await withTransientRetry("enroll", jobId, () =>
              fastBulkEnroll(params.admin, {
                studentId: studentId!,
                courseId: resolved.courseId!,
                enrolledBy: params.adminUserId || jobRow.admin_id,
                fullName: name,
                email,
              }),
            );
            if (newlyEnrolled) enrolledKeys.add(enrollKey);
            bulkImportStage("enrollment", {
              jobId,
              ok: true,
              email,
              newlyEnrolled,
              durationMs: Date.now() - rowStarted,
            });

            if (isNew && password) {
              await enqueueBulkImportEmail(params.admin, {
                jobId,
                rowId: row.id,
                studentId,
                email,
                fullName: name,
                courseTitle: resolved.courseTitle,
                passwordPlain: password,
                kind: "welcome",
              });
              await markRow(params.admin, row.id, "created", null, email);
              counters.created += 1;
            } else if (newlyEnrolled) {
              await enqueueBulkImportEmail(params.admin, {
                jobId,
                rowId: row.id,
                studentId,
                email,
                fullName: name,
                courseTitle: resolved.courseTitle,
                passwordPlain: null,
                kind: "enrollment_notice",
              });
              await markRow(params.admin, row.id, "enrolled", null, email);
              counters.enrolled += 1;
            } else {
              if (notifyAlreadyEnrolled) {
                await enqueueBulkImportEmail(params.admin, {
                  jobId,
                  rowId: row.id,
                  studentId,
                  email,
                  fullName: name,
                  courseTitle: resolved.courseTitle,
                  passwordPlain: null,
                  kind: "enrollment_notice",
                });
              }
              await markRow(
                params.admin,
                row.id,
                "skipped",
                notifyAlreadyEnrolled
                  ? "Already enrolled — enrollment email queued"
                  : "Already enrolled in this course",
                email,
              );
              counters.skipped += 1;
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : "Enrollment failed";
            bulkImportStage("row_failed", {
              jobId,
              ok: false,
              email,
              error: reason,
              durationMs: Date.now() - rowStarted,
            });
            await markRow(params.admin, row.id, "failed", reason, email);
            counters.failed += 1;
          }
        }
      },
    );

    const created = counters.created;
    const enrolled = counters.enrolled;
    const skipped = counters.skipped;
    const failed = counters.failed;

    const recounted = await recountAndPersistJobCounters(params.admin, jobId);

    if (recounted.rowsDone) {
      await maybeFinalizeJobPhase(params.admin, jobId);
    }

    bulkImportStage("chunk_committed", {
      jobId,
      ok: true,
      created,
      enrolled,
      skipped,
      failed,
      pending: recounted.pending,
      processing: recounted.processing,
      processed: recounted.processed,
      rowsDone: recounted.rowsDone,
    });

    return getBulkImportJobSummary(params.admin, jobId);
  });
}

async function maybeFinalizeJobPhase(admin: SupabaseClient<Database>, jobId: string) {
  try {
    const pendingEmails = await countPendingOutboxForJob(admin, jobId);
    if (pendingEmails.total === 0) {
      await admin
        .from("bulk_import_jobs")
        .update({
          phase: "completed",
          status: "completed",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId);
      bulkImportStage("import_completed", { jobId, ok: true });
    } else {
      await admin
        .from("bulk_import_jobs")
        .update({
          phase: "sending_emails",
          status: "processing",
          finished_at: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId);
    }
  } catch {
    await admin
      .from("bulk_import_jobs")
      .update({
        phase: "completed",
        status: "completed",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", jobId);
  }
}

/** Run multiple chunks until budget exhausted or job rows done. */
export async function processBulkImportUntilBudget(params: {
  admin: SupabaseClient<Database>;
  adminUserId: string;
  jobId: string;
  budgetMs?: number;
  asWorker?: boolean;
}): Promise<BulkImportJobSummary> {
  const budgetMs = params.budgetMs ?? 90_000;
  const started = Date.now();
  await reclaimStaleBulkImportClaims(params.admin, 2);
  let summary = await getBulkImportJobSummary(params.admin, params.jobId);
  let rounds = 0;
  while (Date.now() - started < budgetMs && rounds < 80) {
    const pending = await countRowsByStatus(params.admin, params.jobId, "pending");
    const processing = await countRowsByStatus(params.admin, params.jobId, "processing");
    if (pending === 0 && processing === 0) {
      await drainBulkImportEmailOutboxUntilBudget(params.admin, {
        jobId: params.jobId,
        batchSize: 40,
        budgetMs: 25_000,
      });
      await maybeFinalizeJobPhase(params.admin, params.jobId);
      summary = await getBulkImportJobSummary(params.admin, params.jobId);
      rounds++;
      if (summary.done || (summary.emailsPending ?? 0) === 0) break;
      continue;
    }
    summary = await processBulkImportChunk({
      admin: params.admin,
      adminUserId: params.adminUserId,
      jobId: params.jobId,
      asWorker: params.asWorker,
    });
    rounds++;
    if (summary.done && (summary.phase === "completed" || summary.phase === "sending_emails")) {
      break;
    }
  }
  bulkImportStage("budget_pass_finished", {
    jobId: params.jobId,
    ok: true,
    rounds,
    durationMs: Date.now() - started,
  });
  return getBulkImportJobSummary(params.admin, params.jobId);
}

/** Cron: pick oldest active jobs and process within budget. */
export async function processPendingBulkImportJobs(
  admin: SupabaseClient<Database>,
  opts?: { maxJobs?: number; budgetMs?: number },
) {
  await reclaimStaleBulkImportClaims(admin, 12);
  const { data: jobs, error } = await admin
    .from("bulk_import_jobs")
    .select("id, admin_id, status, phase")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .limit(opts?.maxJobs ?? 3);
  if (error) throw new Error(error.message);

  const results = [];
  for (const job of jobs ?? []) {
    const summary = await processBulkImportUntilBudget({
      admin,
      adminUserId: job.admin_id,
      jobId: job.id,
      budgetMs: opts?.budgetMs ?? 90_000,
      asWorker: true,
    });
    results.push(summary);
  }
  return results;
}

async function markRow(
  admin: SupabaseClient<Database>,
  rowId: string,
  status: BulkImportRowStatus,
  reason: string | null,
  _email?: string,
) {
  await admin
    .from("bulk_import_rows")
    .update({
      status,
      reason,
      password_plain: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", rowId);
}

export async function getBulkImportJobSummary(
  admin: SupabaseClient<Database>,
  jobId: string,
  options?: { lite?: boolean },
): Promise<BulkImportJobSummary> {
  const { data: job, error } = await admin.from("bulk_import_jobs").select("*").eq("id", jobId).single();
  if (error) throw new Error(error.message);

  const jobRow = job as unknown as {
    id: string;
    status: BulkImportJobSummary["status"];
    total_rows: number;
    processed_rows: number;
    created_count: number;
    enrolled_count: number;
    skipped_count: number;
    failed_count: number;
    error_message: string | null;
    phase?: string;
    emails_queued?: number;
    emails_sent?: number;
    emails_failed?: number;
  };

  const statusDone = jobRow.status === "completed" || jobRow.status === "failed";
  let pendingRows = 0;
  let processingRows = 0;
  let rowsDone = statusDone || jobRow.processed_rows >= jobRow.total_rows;
  const outboxCounts = await countPendingOutboxForJob(admin, jobId);
  const emailsPending = outboxCounts.total;
  const emailsReady = outboxCounts.ready;
  const outboxDiagnostics = await getOutboxDiagnosticsForJob(admin, jobId);
  const errorMessage = publicJobErrorMessage(jobRow.error_message);
  const emailError =
    !outboxDiagnostics.resendReady
      ? "Resend is not configured. Add RESEND_API_KEY in Vercel → Environment Variables, then redeploy."
      : outboxDiagnostics.lastError;

  if (!options?.lite) {
    const { data: failedRows } = await admin
      .from("bulk_import_rows")
      .select("row_number, email, reason")
      .eq("job_id", jobId)
      .eq("status", "failed")
      .order("row_number", { ascending: true })
      .limit(100);

    pendingRows = await countRowsByStatus(admin, jobId, "pending");
    processingRows = await countRowsByStatus(admin, jobId, "processing");
    rowsDone = pendingRows === 0 && processingRows === 0;

    return {
      jobId: jobRow.id,
      status: jobRow.status,
      phase: jobRow.phase ?? (statusDone ? "completed" : "processing_rows"),
      totalRows: jobRow.total_rows,
      processedRows: jobRow.processed_rows,
      created: jobRow.created_count,
      enrolled: jobRow.enrolled_count,
      skipped: jobRow.skipped_count,
      failed: jobRow.failed_count,
      emailsQueued: jobRow.emails_queued,
      emailsSent: jobRow.emails_sent,
      emailsFailed: jobRow.emails_failed,
      emailsPending,
      emailsReady,
      resendReady: outboxDiagnostics.resendReady,
      emailError,
      errorMessage,
      failures: (failedRows ?? []).map((r) => ({
        row: r.row_number,
        email: r.email || "(missing)",
        reason: r.reason || "Failed",
      })),
      pendingRows,
      processingRows,
      done: rowsDone && emailsPending === 0 && (statusDone || jobRow.phase === "completed"),
    };
  }

  const failures: BulkImportJobSummary["failures"] = [];
  if (statusDone && jobRow.failed_count > 0) {
    const { data: failedRows } = await admin
      .from("bulk_import_rows")
      .select("row_number, email, reason")
      .eq("job_id", jobId)
      .eq("status", "failed")
      .order("row_number", { ascending: true })
      .limit(100);
    for (const r of failedRows ?? []) {
      failures.push({
        row: r.row_number,
        email: r.email || "(missing)",
        reason: r.reason || "Failed",
      });
    }
  }

  if (!rowsDone && jobRow.status === "processing") {
    processingRows = Math.min(
      BULK_IMPORT_CHUNK_SIZE,
      Math.max(0, jobRow.total_rows - jobRow.processed_rows),
    );
    pendingRows = Math.max(0, jobRow.total_rows - jobRow.processed_rows - processingRows);
  } else if (!rowsDone) {
    pendingRows = Math.max(0, jobRow.total_rows - jobRow.processed_rows);
  }

  return {
    jobId: jobRow.id,
    status: jobRow.status,
    phase: jobRow.phase ?? (statusDone ? "completed" : "processing_rows"),
    totalRows: jobRow.total_rows,
    processedRows: jobRow.processed_rows,
    created: jobRow.created_count,
    enrolled: jobRow.enrolled_count,
    skipped: jobRow.skipped_count,
    failed: jobRow.failed_count,
    emailsQueued: jobRow.emails_queued,
    emailsSent: jobRow.emails_sent,
    emailsFailed: jobRow.emails_failed,
    emailsPending,
    emailsReady,
    resendReady: outboxDiagnostics.resendReady,
    emailError,
    errorMessage,
    failures,
    pendingRows,
    processingRows,
    done: rowsDone && emailsPending === 0 && (statusDone || jobRow.phase === "completed"),
  };
}

export async function retryFailedBulkImportRows(
  admin: SupabaseClient<Database>,
  jobId: string,
  adminUserId: string,
) {
  const { data: job, error } = await admin
    .from("bulk_import_jobs")
    .select("id, admin_id")
    .eq("id", jobId)
    .single();
  if (error) throw new Error(error.message);
  if (job.admin_id !== adminUserId) throw new Error("Forbidden.");

  const { error: updError } = await admin
    .from("bulk_import_rows")
    .update({ status: "pending", reason: null, processed_at: null })
    .eq("job_id", jobId)
    .eq("status", "failed");
  if (updError) throw new Error(updError.message);

  await admin
    .from("bulk_import_jobs")
    .update({
      status: "pending",
      phase: "queued",
      finished_at: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", jobId);

  return getBulkImportJobSummary(admin, jobId);
}

export async function exportFailedBulkImportRowsCsv(
  admin: SupabaseClient<Database>,
  jobId: string,
  adminUserId: string,
) {
  const { data: job, error } = await admin
    .from("bulk_import_jobs")
    .select("id, admin_id")
    .eq("id", jobId)
    .single();
  if (error) throw new Error(error.message);
  if (job.admin_id !== adminUserId) throw new Error("Forbidden.");

  const { data: rows, error: rowsError } = await admin
    .from("bulk_import_rows")
    .select("row_number, full_name, email, course_ref, reason")
    .eq("job_id", jobId)
    .eq("status", "failed")
    .order("row_number", { ascending: true });
  if (rowsError) throw new Error(rowsError.message);

  const lines = ["row_number,full_name,email,course,reason"];
  for (const r of rows ?? []) {
    const cells = [
      r.row_number,
      r.full_name,
      r.email,
      r.course_ref,
      r.reason ?? "",
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
