import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCourseResolver,
  ensureImportedStudentProfile,
  findProfileByEmail,
  generateStrongPassword,
  grantCourseAccessForBulkImport,
  isValidStudentEmail,
  parseStudentCsv,
  resolveStudentIdByEmail,
  waitForStudentProfile,
  type CourseLookup,
} from "@/lib/admin-student-onboarding";
import { runAutomations } from "@/lib/automation";
import { enqueueBulkImportEmail } from "@/lib/bulk-import-email-outbox";
import { bulkImportStage, timedStage } from "@/lib/bulk-import-telemetry";
import { isMissingColumnError } from "@/lib/schema-guard";
import type { BulkImportRow, BulkImportRowStatus, Database } from "@/types/database";

export const BULK_IMPORT_CHUNK_SIZE = 15;
export const BULK_IMPORT_MAX_ROWS = 10_000;

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
  errorMessage?: string | null;
  failures: Array<{ row: number; email: string; reason: string }>;
  done: boolean;
  pendingRows?: number;
  processingRows?: number;
};

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
  for (const email of unique) {
    if (map.has(email)) continue;
    const profile = await findProfileByEmail(admin, email);
    if (profile) {
      map.set(email, {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        is_suspended: profile.is_suspended,
      });
    }
  }
  return map;
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
      status: rowsDone ? "completed" : "processing",
      phase: rowsDone ? "sending_emails" : "processing_rows",
      finished_at: rowsDone ? new Date().toISOString() : null,
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
        phase: "processing_rows",
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
    bulkImportStage("student_lookup_batch", {
      jobId,
      ok: true,
      rowCount: emails.length,
      found: profileMap.size,
    });

    let created = 0;
    let enrolled = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      const fullName = row.full_name.trim();
      const rowStarted = Date.now();
      try {
        if (!email) {
          await markRow(params.admin, row.id, "failed", "Email is required on each row");
          failed++;
          continue;
        }
        if (!isValidStudentEmail(email)) {
          await markRow(params.admin, row.id, "failed", "Invalid email format", email);
          failed++;
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
          failed++;
          continue;
        }

        let studentId: string | null = profileMap.get(email)?.id ?? null;
        let isNew = false;
        let password: string | null = null;

        const existing = profileMap.get(email);
        if (existing?.is_suspended) {
          await markRow(params.admin, row.id, "failed", "Student account is suspended", email);
          failed++;
          continue;
        }

        if (!studentId) {
          studentId = await resolveStudentIdByEmail(params.admin, email);
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
            if (!isTransientUpstreamError(createError.message) || attempt === 2) break;
            bulkImportStage("transient_retry", {
              jobId,
              ok: false,
              error: `createUser: ${createError.message.slice(0, 160)}`,
              attempt: attempt + 1,
            });
            await new Promise((r) => setTimeout(r, 750 * (attempt + 1)));
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
              failed++;
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
            await params.admin.from("profiles").update({ full_name: name }).eq("id", studentId);
            await waitForStudentProfile(params.admin, studentId);
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
          failed++;
          continue;
        }

        profileMap.set(email, {
          id: studentId,
          full_name: name,
          email,
          is_suspended: false,
        });

        const { newlyEnrolled } = await withTransientRetry("enroll", jobId, () =>
          grantCourseAccessForBulkImport(params.admin, {
            studentId: studentId!,
            courseId: resolved.courseId!,
            enrolledBy: params.adminUserId || jobRow.admin_id,
            fullName: name,
            email,
          }),
        );
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
          created++;
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
          enrolled++;
        } else {
          await markRow(params.admin, row.id, "skipped", "Already enrolled in this course", email);
          skipped++;
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
        failed++;
      }
    }

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
    const { count } = await admin
      .from("bulk_import_email_outbox" as never)
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .in("status", ["pending", "sending"]);
    if ((count ?? 0) === 0) {
      await admin
        .from("bulk_import_jobs")
        .update({
          phase: "completed",
          status: "completed",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId);
      bulkImportStage("import_completed", { jobId, ok: true });
    }
  } catch {
    await admin
      .from("bulk_import_jobs")
      .update({
        phase: "completed",
        status: "completed",
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
  const budgetMs = params.budgetMs ?? 50_000;
  const started = Date.now();
  let summary = await getBulkImportJobSummary(params.admin, params.jobId);
  let rounds = 0;
  while (Date.now() - started < budgetMs && rounds < 40) {
    const pending = await countRowsByStatus(params.admin, params.jobId, "pending");
    const processing = await countRowsByStatus(params.admin, params.jobId, "processing");
    if (pending === 0 && processing === 0) break;
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
      budgetMs: opts?.budgetMs ?? 45_000,
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
      errorMessage: jobRow.error_message,
      failures: (failedRows ?? []).map((r) => ({
        row: r.row_number,
        email: r.email || "(missing)",
        reason: r.reason || "Failed",
      })),
      pendingRows,
      processingRows,
      done: statusDone && rowsDone,
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
    errorMessage: jobRow.error_message,
    failures,
    pendingRows,
    processingRows,
    done: statusDone && rowsDone,
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
