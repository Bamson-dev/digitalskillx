import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  createBulkImportJob,
  exportFailedBulkImportRowsCsv,
  getBulkImportJobSummary,
  processBulkImportChunk,
  processBulkImportUntilBudget,
  retryFailedBulkImportRows,
} from "@/lib/bulk-import-job";
import { resendFailedOutboxForJob, enqueueEnrollmentNoticesForJob, drainBulkImportEmailOutboxUntilBudget } from "@/lib/bulk-import-email-outbox";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";
import {
  BULK_SYNC_MAX_ROWS,
  readCsvFromFormData,
  runBulkStudentCsvUpload,
} from "@/lib/bulk-student-upload";
import { parseStudentCsv } from "@/lib/student-csv-parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * CSV bulk student import.
 * Upload creates a job, processes as many rows as the request budget allows, then returns jobId.
 * The admin UI continues processing via action=process while the page stays open.
 * Cron / self-chain drain remaining work if the browser is closed.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        action?: string;
        jobId?: string;
      };

      if (body.action === "status" && body.jobId) {
        const auth = await requireAdminApiAuth({ lite: true });
        if ("error" in auth) return auth.error;
        const summary = await getBulkImportJobSummary(auth.admin, body.jobId, { lite: true });
        return NextResponse.json(summary);
      }

      const auth = await requireAdminApiAuth();
      if ("error" in auth) return auth.error;

      if (body.action === "process" && body.jobId) {
        // Optional admin kick (not required). Separate generous limit.
        const limited = await rateLimitedResponse(request, "admin-bulk-students-kick", 120);
        if (limited) return limited;

        const origin = new URL(request.url).origin;
        const summary = await processBulkImportUntilBudget({
          admin: auth.admin,
          adminUserId: auth.user.id,
          jobId: body.jobId,
          budgetMs: 90_000,
          origin,
          asWorker: true,
        });
        if (summary.done) {
          await logAudit({
            action: "students_bulk_created",
            metadata: {
              jobId: summary.jobId,
              created: summary.created,
              enrolled: summary.enrolled,
              skipped: summary.skipped,
              failedCount: summary.failed,
            },
          });
          revalidatePath("/admin/students");
          revalidatePath("/admin/analytics");
        }
        return NextResponse.json(summary);
      }

      if (body.action === "retry_failed" && body.jobId) {
        const summary = await retryFailedBulkImportRows(
          auth.admin,
          body.jobId,
          auth.user.id,
        );
        return NextResponse.json(summary);
      }

      if (body.action === "resend_emails" && body.jobId) {
        await resendFailedOutboxForJob(auth.admin, body.jobId);
        return NextResponse.json({ ok: true });
      }

      if (body.action === "notify_enrolled" && body.jobId) {
        const queued = await enqueueEnrollmentNoticesForJob(auth.admin, body.jobId);
        const drain = await drainBulkImportEmailOutboxUntilBudget(auth.admin, {
          jobId: body.jobId,
          batchSize: 40,
          budgetMs: 25_000,
        });
        const origin = new URL(request.url).origin;
        const { scheduleBulkWorkerContinuation } = await import("@/lib/bulk-import-continue");
        scheduleBulkWorkerContinuation({
          origin,
          path: "/api/cron/email-outbox",
          depth: 0,
          jobId: body.jobId,
          reason: "notify_enrolled",
        });
        return NextResponse.json({ ok: true, ...queued, drain });
      }

      if (body.action === "drain_emails") {
        const origin = new URL(request.url).origin;
        const drain = await drainBulkImportEmailOutboxUntilBudget(auth.admin, {
          jobId: body.jobId,
          batchSize: 40,
          budgetMs: 25_000,
        });
        if (body.jobId) {
          const { scheduleBulkWorkerContinuation } = await import("@/lib/bulk-import-continue");
          scheduleBulkWorkerContinuation({
            origin,
            path: "/api/cron/email-outbox",
            jobId: body.jobId,
            depth: 0,
            reason: "admin_drain_emails",
          });
        }
        return NextResponse.json({ ok: true, ...drain });
      }

      if (body.action === "export_failed" && body.jobId) {
        const csv = await exportFailedBulkImportRowsCsv(
          auth.admin,
          body.jobId,
          auth.user.id,
        );
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="bulk-import-failed-${body.jobId}.csv"`,
          },
        });
      }

      // Legacy single-chunk process still available
      if (body.action === "process_one" && body.jobId) {
        const summary = await processBulkImportChunk({
          admin: auth.admin,
          adminUserId: auth.user.id,
          jobId: body.jobId,
        });
        return NextResponse.json(summary);
      }

      return NextResponse.json({ error: "Invalid JSON action." }, { status: 400 });
    }

    const auth = await requireAdminApiAuth();
    if ("error" in auth) return auth.error;

    const origin = new URL(request.url).origin;

    // Job creation only — tight limit (prevents abuse, not chunk loops)
    const limited = await rateLimitedResponse(request, "admin-bulk-students-create", 15);
    if (limited) return limited;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
    }

    const defaultCourseId = String(formData.get("default_course_id") ?? "").trim() || null;
    const notifyAlreadyEnrolled =
      String(formData.get("notify_already_enrolled") ?? "") === "1";
    const csvText = await readCsvFromFormData(formData);
    if (!csvText?.trim()) {
      return NextResponse.json({ error: "Upload a CSV file or paste CSV rows." }, { status: 400 });
    }

    bulkImportStage("csv_received", {
      ok: true,
      bytes: csvText.length,
      hasDefaultCourse: Boolean(defaultCourseId),
    });

    const { rows } = parseStudentCsv(csvText);
    const dataRowCount = rows.filter((r) => r.email || r.fullName).length;
    const forceSync = String(formData.get("force_sync") ?? "") === "1";

    bulkImportStage("validation_finished", {
      ok: true,
      rowCount: dataRowCount,
    });

    const created = await createBulkImportJob({
      admin: auth.admin,
      adminUserId: auth.user.id,
      csvText,
      defaultCourseId,
      notifyAlreadyEnrolled,
    });

    if ("fallbackRequired" in created) {
      if (dataRowCount > BULK_SYNC_MAX_ROWS) {
        return NextResponse.json(
          {
            error: `${created.reason} For now, split into files of ≤${BULK_SYNC_MAX_ROWS} rows.`,
          },
          { status: 400 },
        );
      }

      const result = await runBulkStudentCsvUpload({
        admin: auth.admin,
        adminUserId: auth.user.id,
        csvText,
        defaultCourseId,
        notifyAlreadyEnrolled,
      });

      await logAudit({
        action: "students_bulk_created",
        metadata: {
          created: result.bulkSummary.created,
          enrolled: result.bulkSummary.enrolled,
          skipped: result.bulkSummary.skipped,
          failedCount: result.bulkSummary.failed.length,
        },
      });

      revalidatePath("/admin/students");
      revalidatePath("/admin/analytics");

      return NextResponse.json(result);
    }

    const jobResponse = (summary: Awaited<ReturnType<typeof processBulkImportUntilBudget>>) => ({
      jobId: created.jobId,
      totalRows: created.totalRows,
      message: `Bulk upload finished: ${summary.created} created, ${summary.enrolled} existing student(s) enrolled, ${summary.skipped} skipped, ${summary.failed} failed.`,
      bulkSummary: {
        created: summary.created,
        enrolled: summary.enrolled,
        skipped: summary.skipped,
        failed: summary.failures,
        failedCount: summary.failed,
      },
      done: summary.done,
    });

    // Small uploads and force_sync wait for completion so bulk_import_rows exist for imported-student links.
    if (forceSync || dataRowCount <= 10) {
      let summary = await processBulkImportUntilBudget({
        admin: auth.admin,
        adminUserId: auth.user.id,
        jobId: created.jobId,
        budgetMs: 120_000,
        asWorker: true,
        origin,
      });

      for (let attempt = 0; !summary.done && attempt < 24; attempt++) {
        summary = await processBulkImportUntilBudget({
          admin: auth.admin,
          adminUserId: auth.user.id,
          jobId: created.jobId,
          budgetMs: 120_000,
          asWorker: true,
          origin,
        });
      }

      if (summary.done) {
        await logAudit({
          action: "students_bulk_created",
          metadata: {
            jobId: summary.jobId,
            created: summary.created,
            enrolled: summary.enrolled,
            skipped: summary.skipped,
            failedCount: summary.failed,
          },
        });
        revalidatePath("/admin/students");
        revalidatePath("/admin/analytics");
      }

      return NextResponse.json(
        summary.done
          ? jobResponse(summary)
          : {
              ...summary,
              jobId: created.jobId,
              totalRows: created.totalRows,
              chunked: true,
              message: `Import still processing (${summary.processedRows}/${summary.totalRows}). Poll action=status.`,
            },
      );
    }

    // Large uploads: return a jobId immediately so the UI can show progress.
    // Background workers continue processing and email sending if the browser closes.
    void processBulkImportUntilBudget({
      admin: auth.admin,
      adminUserId: auth.user.id,
      jobId: created.jobId,
      budgetMs: 90_000,
      asWorker: true,
      origin,
    })
      .then(async (summary) => {
        const { scheduleBulkWorkerContinuation } = await import("@/lib/bulk-import-continue");
        if ((summary.emailsPending ?? 0) > 0) {
          scheduleBulkWorkerContinuation({
            origin,
            path: "/api/cron/email-outbox",
            jobId: created.jobId,
            depth: 0,
            reason: "post_upload_emails",
          });
        } else if (!summary.done) {
          scheduleBulkWorkerContinuation({
            origin,
            path: "/api/cron/bulk-import",
            depth: 0,
            reason: "post_upload_kick",
          });
        }
      })
      .catch((err) => {
        bulkImportStage("inline_kick_failed", {
          jobId: created.jobId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        void import("@/lib/bulk-import-continue").then(({ scheduleBulkWorkerContinuation }) => {
          scheduleBulkWorkerContinuation({
            origin,
            path: "/api/cron/bulk-import",
            depth: 0,
            reason: "kick_error_recovery",
          });
        });
      });

    return NextResponse.json({
      jobId: created.jobId,
      totalRows: created.totalRows,
      chunked: true,
      processedRows: 0,
      message: `Import started for ${created.totalRows} rows. Processing continues in the background — safe to close this tab.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk upload failed.";
    bulkImportStage("upload_failed", { ok: false, error: message });
    console.error("[bulk-students]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
