import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendStudentWelcomeEmail } from "@/lib/admin-student-onboarding";
import { courseEnrollmentEmail } from "@/lib/email/system-templates";
import { getEmailSenderConfig, getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { sendSystemEmail } from "@/lib/system-email";
import { studentFirstName } from "@/lib/student-name";
import { siteUrl as orgSiteUrl } from "@/lib/org";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";
import { isMissingColumnError } from "@/lib/schema-guard";
import { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";
import { resendConfigured } from "@/lib/email/providers/resend";
import { buildCourseResolver } from "@/lib/course-resolver";
import type { Database } from "@/types/database";

export type OutboxKind = "welcome" | "enrollment_notice";
export { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? orgSiteUrl() ?? "https://digitalskillx.com").replace(
    /\/$/,
    "",
  );
}

export function outboxTableMissing(message: string) {
  return (
    isMissingColumnError(message) ||
    /bulk_import_email_outbox|relation .* does not exist/i.test(message)
  );
}

export async function enqueueBulkImportEmail(
  admin: SupabaseClient<Database>,
  params: {
    jobId: string;
    rowId: string;
    studentId: string;
    email: string;
    fullName: string;
    courseTitle: string | null;
    passwordPlain: string | null;
    kind: OutboxKind;
  },
): Promise<{ queued: boolean; fallbackSent?: boolean }> {
  if (isSyntheticTestRecipient(params.email)) {
    bulkImportStage("email_skipped_synthetic", {
      jobId: params.jobId,
      ok: true,
      kind: params.kind,
      email: params.email,
    });
    return { queued: false };
  }

  const { error } = await admin.from("bulk_import_email_outbox" as never).insert({
    job_id: params.jobId,
    row_id: params.rowId,
    student_id: params.studentId,
    email: params.email,
    full_name: params.fullName,
    course_title: params.courseTitle,
    password_plain: params.passwordPlain,
    kind: params.kind,
    status: "pending",
  } as never);

  if (!error) {
    try {
      const { data: job } = await admin
        .from("bulk_import_jobs")
        .select("emails_queued")
        .eq("id", params.jobId)
        .maybeSingle();
      if (job && "emails_queued" in job) {
        await admin
          .from("bulk_import_jobs")
          .update({
            emails_queued: ((job as { emails_queued?: number }).emails_queued ?? 0) + 1,
          } as never)
          .eq("id", params.jobId);
      }
    } catch {
      /* column may be missing until SQL applied */
    }

    bulkImportStage("email_queued", {
      jobId: params.jobId,
      ok: true,
      kind: params.kind,
      email: params.email,
    });
    return { queued: true };
  }

  if (outboxTableMissing(error.message)) {
    // Fallback: fire-and-forget so older DBs still get mail (not ideal, but don't block enrollment)
    bulkImportStage("email_outbox_missing_fallback", {
      jobId: params.jobId,
      ok: false,
      error: error.message,
    });
    if (params.kind === "welcome" && params.passwordPlain) {
      const settings = await getPlatformSettingsAdmin();
      void sendStudentWelcomeEmail({
        studentId: params.studentId,
        fullName: params.fullName,
        email: params.email,
        password: params.passwordPlain,
        courseNames: params.courseTitle ? [params.courseTitle] : [],
        siteUrl: siteUrl(),
        brandColor: settings.primary_color,
      }).catch(() => undefined);
      return { queued: false, fallbackSent: true };
    }
    return { queued: false };
  }

  throw new Error(error.message);
}

async function reclaimStaleOutboxSending(
  admin: SupabaseClient<Database>,
  olderThanMinutes = 2,
  jobId?: string,
) {
  try {
    await admin.rpc("reclaim_stale_bulk_import_email_outbox" as never, {
      p_older_than_minutes: olderThanMinutes,
    } as never);
  } catch {
    const staleBefore = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
    let query = admin
      .from("bulk_import_email_outbox" as never)
      .update({
        status: "pending",
        updated_at: new Date().toISOString(),
        last_error: "reclaimed_stale_sending",
      } as never)
      .eq("status", "sending")
      .lt("updated_at", staleBefore);
    if (jobId) query = query.eq("job_id", jobId);
    await query;
  }
}

async function claimOutboxRows(
  admin: SupabaseClient<Database>,
  limit: number,
  jobId?: string,
): Promise<Array<Record<string, unknown>>> {
  const claimed: Array<Record<string, unknown>> = [];

  if (jobId) {
    const { data: pending, error } = await admin
      .from("bulk_import_email_outbox" as never)
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(limit);
    if (error) {
      if (outboxTableMissing(error.message)) return [];
      throw new Error(error.message);
    }
    for (const row of pending ?? []) {
      const { data: locked } = await admin
        .from("bulk_import_email_outbox" as never)
        .update({
          status: "sending",
          attempts: ((row as { attempts?: number }).attempts ?? 0) + 1,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", (row as { id: string }).id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (locked) claimed.push(locked as Record<string, unknown>);
    }
    return claimed;
  }

  const { data: rpcRows, error: rpcError } = await admin.rpc(
    "claim_bulk_import_email_outbox" as never,
    { p_limit: limit } as never,
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    return rpcRows as Array<Record<string, unknown>>;
  }

  const { data: pending, error } = await admin
    .from("bulk_import_email_outbox" as never)
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) {
    if (outboxTableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  for (const row of pending ?? []) {
    const { data: locked } = await admin
      .from("bulk_import_email_outbox" as never)
      .update({
        status: "sending",
        attempts: ((row as { attempts?: number }).attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", (row as { id: string }).id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (locked) claimed.push(locked as Record<string, unknown>);
  }
  return claimed;
}

/** Fail pending synthetic test rows in bulk so real buyer mail is not stuck behind them. */
export async function purgeSyntheticPendingOutbox(admin: SupabaseClient<Database>) {
  const patterns = ["cert+%", "stress+%", "csv-cert+%", "paystack-cert+%"];
  let purged = 0;
  for (const pattern of patterns) {
    const { data: rows } = await admin
      .from("bulk_import_email_outbox" as never)
      .select("id, email, job_id")
      .eq("status", "pending")
      .ilike("email", pattern);
    for (const row of rows ?? []) {
      const email = String((row as { email?: string }).email ?? "");
      if (!isSyntheticTestRecipient(email)) continue;
      const id = String((row as { id: string }).id);
      const jobId = String((row as { job_id: string }).job_id);
      await admin
        .from("bulk_import_email_outbox" as never)
        .update({
          status: "failed",
          password_plain: null,
          last_error: "Skipped synthetic test recipient",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);
      purged++;
      bulkImportStage("email_skipped_synthetic", { jobId, ok: true, email });
    }
  }
  if (purged > 0) {
    bulkImportStage("synthetic_outbox_purged", { ok: true, rowCount: purged });
  }
  return purged;
}

export async function drainBulkImportEmailOutbox(
  admin: SupabaseClient<Database>,
  limit = 20,
  options?: { jobId?: string; reclaimMinutes?: number },
): Promise<{ sent: number; failed: number; claimed: number; resendReady: boolean }> {
  const started = Date.now();
  const resendReady = resendConfigured();
  await reclaimStaleOutboxSending(admin, options?.reclaimMinutes ?? 2, options?.jobId);
  const claimed = await claimOutboxRows(admin, limit, options?.jobId);

  const settings = await getPlatformSettingsAdmin();
  const sender = await getEmailSenderConfig();
  let sent = 0;
  let failed = 0;

  for (const row of claimed) {
    const id = String(row.id);
    const jobId = String(row.job_id);
    const email = String(row.email);
    const fullName = String(row.full_name ?? "");
    const courseTitle = (row.course_title as string | null) ?? null;
    const password = (row.password_plain as string | null) ?? null;
    const kind = String(row.kind ?? "welcome") as OutboxKind;
    const studentId = String(row.student_id);
    const attempts = Number(row.attempts ?? 1);

    try {
      if (isSyntheticTestRecipient(email)) {
        await admin
          .from("bulk_import_email_outbox" as never)
          .update({
            status: "failed",
            password_plain: null,
            last_error: "Skipped synthetic test recipient",
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", id);
        try {
          const { data: job } = await admin
            .from("bulk_import_jobs")
            .select("emails_failed")
            .eq("id", jobId)
            .maybeSingle();
          if (job && "emails_failed" in job) {
            await admin
              .from("bulk_import_jobs")
              .update({
                emails_failed: ((job as { emails_failed?: number }).emails_failed ?? 0) + 1,
              } as never)
              .eq("id", jobId);
          }
        } catch {
          /* ignore */
        }
        failed++;
        bulkImportStage("email_skipped_synthetic", { jobId, ok: true, kind, email });
        continue;
      }

      if (kind === "welcome") {
        if (!password) {
          throw new Error("Welcome email missing password payload");
        }
        await sendStudentWelcomeEmail({
          studentId,
          fullName,
          email,
          password,
          courseNames: courseTitle ? [courseTitle] : [],
          siteUrl: siteUrl(),
          brandColor: settings.primary_color,
        });
      } else {
        const tpl = courseEnrollmentEmail({
          firstName: studentFirstName(fullName),
          courseTitle: courseTitle ?? "your course",
          courseUrl: `${siteUrl()}/dashboard`,
          loginUrl: `${siteUrl()}/login`,
          brandColor: settings.primary_color,
          supportEmail: sender.replyTo || "support@digitalskillx.com",
        });
        const result = await sendSystemEmail({
          type: "course_enrollment",
          to: email,
          subject: tpl.subject,
          html: tpl.html,
          payload: { jobId, studentId, kind },
        });
        if (!result.sent) {
          throw new Error(
            "error" in result && result.error
              ? String(result.error)
              : "Enrollment email was not sent",
          );
        }
      }

      await admin
        .from("bulk_import_email_outbox" as never)
        .update({
          status: "sent",
          password_plain: null,
          sent_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);

      try {
        const { data: job } = await admin
          .from("bulk_import_jobs")
          .select("emails_sent")
          .eq("id", jobId)
          .maybeSingle();
        if (job && "emails_sent" in job) {
          await admin
            .from("bulk_import_jobs")
            .update({
              emails_sent: ((job as { emails_sent?: number }).emails_sent ?? 0) + 1,
            } as never)
            .eq("id", jobId);
        }
      } catch {
        /* ignore */
      }

      sent++;
      bulkImportStage("email_sent", { jobId, ok: true, kind, email });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = attempts < 8;
      const backoffMin = Math.min(60, 2 ** Math.min(attempts, 5));
      await admin
        .from("bulk_import_email_outbox" as never)
        .update({
          status: retryable ? "pending" : "failed",
          last_error: message.slice(0, 500),
          scheduled_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);

      if (!retryable) {
        try {
          const { data: job } = await admin
            .from("bulk_import_jobs")
            .select("emails_failed")
            .eq("id", jobId)
            .maybeSingle();
          if (job && "emails_failed" in job) {
            await admin
              .from("bulk_import_jobs")
              .update({
                emails_failed: ((job as { emails_failed?: number }).emails_failed ?? 0) + 1,
              } as never)
              .eq("id", jobId);
          }
        } catch {
          /* ignore */
        }
        failed++;
      }

      bulkImportStage("email_send_failed", {
        jobId,
        ok: false,
        kind,
        email,
        error: message,
        attempts,
        retryable,
      });
    }
  }

  bulkImportStage("email_drain_finished", {
    ok: true,
    sent,
    failed,
    claimed: claimed.length,
    resendReady,
    jobId: options?.jobId,
    durationMs: Date.now() - started,
    rowCount: claimed.length,
  });

  return { sent, failed, claimed: claimed.length, resendReady };
}

/** Drain many batches within a time budget (admin UI / cron). */
export async function drainBulkImportEmailOutboxUntilBudget(
  admin: SupabaseClient<Database>,
  opts?: { jobId?: string; batchSize?: number; budgetMs?: number },
) {
  if (!resendConfigured()) {
    return {
      sent: 0,
      failed: 0,
      batches: 0,
      resendReady: false as const,
      error: "Resend is not configured. Add RESEND_API_KEY in Vercel → Environment Variables, then redeploy.",
    };
  }

  await purgeSyntheticPendingOutbox(admin);

  const batchSize = opts?.batchSize ?? 40;
  const budgetMs = opts?.budgetMs ?? 85_000;
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  let batches = 0;

  while (Date.now() - started < budgetMs) {
    const batch = await drainBulkImportEmailOutbox(admin, batchSize, {
      jobId: opts?.jobId,
      reclaimMinutes: 2,
    });
    sent += batch.sent;
    failed += batch.failed;
    batches += 1;
    if (batch.claimed === 0) break;
  }

  return { sent, failed, batches, resendReady: true as const };
}

export async function resendFailedOutboxForJob(
  admin: SupabaseClient<Database>,
  jobId: string,
) {
  const { error } = await admin
    .from("bulk_import_email_outbox" as never)
    .update({
      status: "pending",
      scheduled_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("job_id", jobId)
    .eq("status", "failed");
  if (error) {
    if (outboxTableMissing(error.message)) {
      throw new Error(
        "Email outbox table missing. Run sql/apply-bulk-import-outbox.sql in Supabase.",
      );
    }
    throw new Error(error.message);
  }
}

export async function getOutboxDiagnosticsForJob(
  admin: SupabaseClient<Database>,
  jobId: string,
) {
  const { data: sample } = await admin
    .from("bulk_import_email_outbox" as never)
    .select("last_error, status, email")
    .eq("job_id", jobId)
    .not("last_error", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    resendReady: resendConfigured(),
    lastError: (sample as { last_error?: string | null } | null)?.last_error ?? null,
  };
}

export async function countPendingOutboxForJob(
  admin: SupabaseClient<Database>,
  jobId: string,
) {
  const { count, error } = await admin
    .from("bulk_import_email_outbox" as never)
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .in("status", ["pending", "sending"]);
  if (error) {
    if (outboxTableMissing(error.message)) return 0;
    return 0;
  }
  return count ?? 0;
}

/**
 * Queue enrollment notices for created/enrolled/skipped rows that do not already
 * have a pending or sent outbox row on this job. Used to email a finished CSV
 * import that skipped already-enrolled students.
 */
export async function enqueueEnrollmentNoticesForJob(
  admin: SupabaseClient<Database>,
  jobId: string,
): Promise<{ queued: number; alreadyQueued: number; skippedSynthetic: number }> {
  const { data: job, error: jobError } = await admin
    .from("bulk_import_jobs")
    .select("id, default_course_id")
    .eq("id", jobId)
    .single();
  if (jobError) throw new Error(jobError.message);

  const { data: courses, error: coursesError } = await admin.from("courses").select("id, title");
  if (coursesError) throw new Error(coursesError.message);
  const resolveCourse = buildCourseResolver((courses ?? []) as Array<{ id: string; title: string }>);

  const { data: rows, error: rowsError } = await admin
    .from("bulk_import_rows")
    .select("id, email, full_name, course_ref, status")
    .eq("job_id", jobId)
    .in("status", ["created", "enrolled", "skipped"]);
  if (rowsError) throw new Error(rowsError.message);

  const { data: existing, error: existingError } = await admin
    .from("bulk_import_email_outbox" as never)
    .select("email")
    .eq("job_id", jobId)
    .in("status", ["pending", "sending", "sent"]);
  if (existingError && !outboxTableMissing(existingError.message)) {
    throw new Error(existingError.message);
  }
  const already = new Set(
    ((existing ?? []) as Array<{ email: string }>).map((row) =>
      String(row.email ?? "")
        .trim()
        .toLowerCase(),
    ),
  );

  const emails = [
    ...new Set(
      (rows ?? [])
        .map((row) => String(row.email ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const profileByEmail = new Map<string, { id: string; full_name: string | null }>();
  for (let i = 0; i < emails.length; i += 100) {
    const slice = emails.slice(i, i + 100);
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("email", slice);
    if (error) throw new Error(error.message);
    for (const profile of profiles ?? []) {
      const key = String(profile.email ?? "")
        .trim()
        .toLowerCase();
      if (key) profileByEmail.set(key, { id: profile.id, full_name: profile.full_name });
    }
  }

  let queued = 0;
  let alreadyQueued = 0;
  let skippedSynthetic = 0;

  for (const row of rows ?? []) {
    const email = String(row.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    if (isSyntheticTestRecipient(email)) {
      skippedSynthetic += 1;
      continue;
    }
    if (already.has(email)) {
      alreadyQueued += 1;
      continue;
    }
    const profile = profileByEmail.get(email);
    if (!profile) continue;
    const resolved = resolveCourse(String(row.course_ref ?? ""), job.default_course_id);
    const result = await enqueueBulkImportEmail(admin, {
      jobId,
      rowId: String(row.id),
      studentId: profile.id,
      email,
      fullName: String(row.full_name || profile.full_name || email.split("@")[0] || "Student"),
      courseTitle: resolved.courseTitle,
      passwordPlain: null,
      kind: "enrollment_notice",
    });
    if (result.queued) {
      already.add(email);
      queued += 1;
    }
  }

  if (queued > 0 || (await countPendingOutboxForJob(admin, jobId)) > 0) {
    await admin
      .from("bulk_import_jobs")
      .update({
        status: "processing",
        phase: "sending_emails",
        finished_at: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", jobId);
  }

  bulkImportStage("enrollment_notices_enqueued", {
    jobId,
    ok: true,
    queued,
    alreadyQueued,
    skippedSynthetic,
  });

  return { queued, alreadyQueued, skippedSynthetic };
}
