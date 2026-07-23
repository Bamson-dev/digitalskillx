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
import type { Database } from "@/types/database";

export type OutboxKind = "welcome" | "enrollment_notice";

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

export async function drainBulkImportEmailOutbox(
  admin: SupabaseClient<Database>,
  limit = 20,
): Promise<{ sent: number; failed: number }> {
  const started = Date.now();
  let claimed: Array<Record<string, unknown>> = [];

  const { data: rpcRows, error: rpcError } = await admin.rpc(
    "claim_bulk_import_email_outbox" as never,
    { p_limit: limit } as never,
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    claimed = rpcRows as Array<Record<string, unknown>>;
  } else {
    const { data: pending, error } = await admin
      .from("bulk_import_email_outbox" as never)
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(limit);
    if (error) {
      if (outboxTableMissing(error.message)) {
        bulkImportStage("email_drain_skipped_no_table", { ok: true, error: error.message });
        return { sent: 0, failed: 0 };
      }
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
  }

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
    durationMs: Date.now() - started,
    rowCount: claimed.length,
  });

  return { sent, failed };
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
