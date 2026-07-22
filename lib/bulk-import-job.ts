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
import { sendStudentWelcomeEmail } from "@/lib/admin-student-onboarding";
import { getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { isMissingColumnError } from "@/lib/schema-guard";
import type { BulkImportRow, BulkImportRowStatus, Database } from "@/types/database";

export const BULK_IMPORT_CHUNK_SIZE = 40;
export const BULK_IMPORT_MAX_ROWS = 5000;

export type BulkImportJobSummary = {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalRows: number;
  processedRows: number;
  created: number;
  enrolled: number;
  skipped: number;
  failed: number;
  errorMessage?: string | null;
  failures: Array<{ row: number; email: string; reason: string }>;
  done: boolean;
};

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://digitalskillx.com").replace(/\/$/, "");
}

function jobsTableMissing(message: string) {
  return isMissingColumnError(message) || /bulk_import_jobs|relation .* does not exist/i.test(message);
}

export async function createBulkImportJob(params: {
  admin: SupabaseClient<Database>;
  adminUserId: string;
  csvText: string;
  defaultCourseId: string | null;
}): Promise<{ jobId: string; totalRows: number } | { fallbackRequired: true; reason: string }> {
  const { rows } = parseStudentCsv(params.csvText);
  const dataRows = rows.filter((r) => r.email || r.fullName);
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
    })
    .select("id")
    .single();

  if (jobError) {
    if (jobsTableMissing(jobError.message)) {
      return {
        fallbackRequired: true,
        reason:
          "Bulk import job tables are missing. Run supabase/migrations/0028_bulk_import_jobs.sql, or use a smaller CSV (≤150 rows) on the sync path.",
      };
    }
    throw new Error(jobError.message);
  }

  const jobId = job.id;
  const payload = dataRows.map((row) => ({
    job_id: jobId,
    row_number: row.rowNumber,
    full_name: row.fullName,
    email: row.email,
    course_ref: row.courseRef,
    status: "pending" as const,
  }));

  // Insert in batches of 500
  for (let i = 0; i < payload.length; i += 500) {
    const slice = payload.slice(i, i + 500);
    const { error: rowsError } = await params.admin.from("bulk_import_rows").insert(slice);
    if (rowsError) {
      await params.admin.from("bulk_import_jobs").delete().eq("id", jobId);
      throw new Error(rowsError.message);
    }
  }

  return { jobId, totalRows: dataRows.length };
}

async function batchFindProfilesByEmails(
  admin: SupabaseClient<Database>,
  emails: string[],
) {
  const map = new Map<string, { id: string; full_name: string | null; email: string; is_suspended: boolean }>();
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
  // Also try ilike for case variants when exact match miss
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

export async function processBulkImportChunk(params: {
  admin: SupabaseClient<Database>;
  adminUserId: string;
  jobId: string;
  chunkSize?: number;
}): Promise<BulkImportJobSummary> {
  const chunkSize = params.chunkSize ?? BULK_IMPORT_CHUNK_SIZE;

  const { data: job, error: jobError } = await params.admin
    .from("bulk_import_jobs")
    .select("*")
    .eq("id", params.jobId)
    .single();

  if (jobError) throw new Error(jobError.message);
  const jobRow = job;

  if (jobRow.admin_id !== params.adminUserId) {
    throw new Error("Forbidden.");
  }

  if (jobRow.status === "completed" || jobRow.status === "failed") {
    return getBulkImportJobSummary(params.admin, params.jobId);
  }

  await params.admin
    .from("bulk_import_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", params.jobId);

  // Prefer DB claim RPC (skip locked). Fallback: optimistic claim per selected row.
  let rows: BulkImportRow[] = [];
  const { data: claimedRpc, error: claimRpcError } = await params.admin.rpc(
    "claim_bulk_import_rows" as never,
    { p_job_id: params.jobId, p_limit: chunkSize } as never,
  );
  if (!claimRpcError && Array.isArray(claimedRpc)) {
    rows = claimedRpc as BulkImportRow[];
  } else {
    if (claimRpcError) {
      console.warn(
        "[processBulkImportChunk] claim_bulk_import_rows unavailable; using optimistic claim",
        claimRpcError.message,
      );
    }
    const { data: pendingRows, error: pendingError } = await params.admin
      .from("bulk_import_rows")
      .select("*")
      .eq("job_id", params.jobId)
      .eq("status", "pending")
      .order("row_number", { ascending: true })
      .limit(chunkSize);
    if (pendingError) throw new Error(pendingError.message);

    for (const row of pendingRows ?? []) {
      const { data: claimed, error: claimError } = await params.admin
        .from("bulk_import_rows")
        .update({ status: "processing" })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (claimError) {
        // Schema may not allow 'processing' yet — fall back to non-claimed pending rows.
        console.warn("[processBulkImportChunk] optimistic claim failed", claimError.message);
        rows = (pendingRows ?? []) as BulkImportRow[];
        break;
      }
      if (claimed) rows.push(claimed as BulkImportRow);
    }
  }

  if (rows.length === 0) {
    await params.admin
      .from("bulk_import_jobs")
      .update({
        status: "completed",
        processed_rows: jobRow.total_rows,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.jobId);
    return getBulkImportJobSummary(params.admin, params.jobId);
  }

  const { data: courses, error: coursesError } = await params.admin
    .from("courses")
    .select("id, title")
    .order("title");
  if (coursesError) throw new Error(coursesError.message);
  const resolveCourse = buildCourseResolver((courses ?? []) as CourseLookup[]);
  const settings = await getPlatformSettingsAdmin();

  const emails = rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
  const profileMap = await batchFindProfilesByEmails(params.admin, emails);

  let created = 0;
  let enrolled = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const fullName = row.full_name.trim();
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
        const { data: createdUser, error } = await params.admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: name },
        });
        if (error) {
          const recovered = await resolveStudentIdByEmail(params.admin, email);
          if (!recovered) {
            await markRow(params.admin, row.id, "failed", error.message, email);
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
          studentId = createdUser.user.id;
          isNew = true;
          await params.admin.from("profiles").update({ full_name: name }).eq("id", studentId);
          await waitForStudentProfile(params.admin, studentId);
          try {
            await runAutomations("account_created", { studentId });
          } catch (err) {
            console.error("[processBulkImportChunk] account_created automation", err);
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

      const { newlyEnrolled } = await grantCourseAccessForBulkImport(params.admin, {
        studentId,
        courseId: resolved.courseId,
        enrolledBy: params.adminUserId,
        fullName: name,
        email,
      });

      if (isNew && password) {
        // Defer welcome email until after row is marked — still send here but non-blocking for job status
        void sendStudentWelcomeEmail({
          studentId,
          fullName: name,
          email,
          password,
          courseNames: resolved.courseTitle ? [resolved.courseTitle] : [],
          siteUrl: siteUrl(),
          brandColor: settings.primary_color,
        }).catch((err) => console.error("[processBulkImportChunk] welcome email", err));
        await markRow(params.admin, row.id, "created", null, email);
        created++;
      } else if (newlyEnrolled) {
        await markRow(params.admin, row.id, "enrolled", null, email);
        enrolled++;
      } else {
        await markRow(params.admin, row.id, "skipped", "Already enrolled in this course", email);
        skipped++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Enrollment failed";
      await markRow(params.admin, row.id, "failed", reason, email);
      failed++;
    }
  }

  const processedDelta = rows.length;
  const { data: refreshed } = await params.admin
    .from("bulk_import_jobs")
    .select("processed_rows, created_count, enrolled_count, skipped_count, failed_count, total_rows")
    .eq("id", params.jobId)
    .single();

  const current = refreshed;

  const nextProcessed = (current?.processed_rows ?? jobRow.processed_rows) + processedDelta;
  const done = nextProcessed >= (current?.total_rows ?? jobRow.total_rows);

  await params.admin
    .from("bulk_import_jobs")
    .update({
      processed_rows: nextProcessed,
      created_count: (current?.created_count ?? jobRow.created_count) + created,
      enrolled_count: (current?.enrolled_count ?? jobRow.enrolled_count) + enrolled,
      skipped_count: (current?.skipped_count ?? jobRow.skipped_count) + skipped,
      failed_count: (current?.failed_count ?? jobRow.failed_count) + failed,
      status: done ? "completed" : "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.jobId);

  return getBulkImportJobSummary(params.admin, params.jobId);
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
): Promise<BulkImportJobSummary> {
  const { data: job, error } = await admin
    .from("bulk_import_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error) throw new Error(error.message);

  const jobRow = job;

  const { data: failedRows } = await admin
    .from("bulk_import_rows")
    .select("row_number, email, reason")
    .eq("job_id", jobId)
    .eq("status", "failed")
    .order("row_number", { ascending: true })
    .limit(100);

  return {
    jobId: jobRow.id,
    status: jobRow.status,
    totalRows: jobRow.total_rows,
    processedRows: jobRow.processed_rows,
    created: jobRow.created_count,
    enrolled: jobRow.enrolled_count,
    skipped: jobRow.skipped_count,
    failed: jobRow.failed_count,
    errorMessage: jobRow.error_message,
    failures: (failedRows ?? []).map((r) => ({
      row: r.row_number,
      email: r.email || "(missing)",
      reason: r.reason || "Failed",
    })),
    done: jobRow.status === "completed" || jobRow.status === "failed",
  };
}
