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
import { resendFailedOutboxForJob } from "@/lib/bulk-import-email-outbox";
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
 * Upload creates a job and returns jobId. Background cron (+ optional kick) processes rows.
 * UI should poll action=status only — never drive the full chunk loop.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApiAuth();
    if ("error" in auth) return auth.error;

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        action?: string;
        jobId?: string;
      };

      if (body.action === "status" && body.jobId) {
        // Status polls are frequent — do not share the create/process rate bucket.
        const summary = await getBulkImportJobSummary(auth.admin, body.jobId);
        return NextResponse.json(summary);
      }

      if (body.action === "process" && body.jobId) {
        // Optional admin kick (not required). Separate generous limit.
        const limited = await rateLimitedResponse(request, "admin-bulk-students-kick", 120);
        if (limited) return limited;

        const summary = await processBulkImportUntilBudget({
          admin: auth.admin,
          adminUserId: auth.user.id,
          jobId: body.jobId,
          budgetMs: 45_000,
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

    // Prefer durable job path for anything above tiny pastes
    if (!forceSync && dataRowCount > 10) {
      const created = await createBulkImportJob({
        admin: auth.admin,
        adminUserId: auth.user.id,
        csvText,
        defaultCourseId,
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
      } else {
        // Kick processing immediately, then self-chain via cron worker if more remains.
        const origin = new URL(request.url).origin;
        void processBulkImportUntilBudget({
          admin: auth.admin,
          adminUserId: auth.user.id,
          jobId: created.jobId,
          budgetMs: 40_000,
          asWorker: true,
        })
          .then(async (summary) => {
            if (!summary.done) {
              const { scheduleBulkWorkerContinuation } = await import(
                "@/lib/bulk-import-continue"
              );
              scheduleBulkWorkerContinuation({
                origin,
                path: "/api/cron/bulk-import",
                depth: 0,
                reason: "post_upload_kick",
              });
            } else {
              const { scheduleBulkWorkerContinuation } = await import(
                "@/lib/bulk-import-continue"
              );
              scheduleBulkWorkerContinuation({
                origin,
                path: "/api/cron/email-outbox",
                depth: 0,
                reason: "post_upload_emails",
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
          message: `Import job created for ${created.totalRows} rows. Processing in the background…`,
        });
      }
    }

    const result = await runBulkStudentCsvUpload({
      admin: auth.admin,
      adminUserId: auth.user.id,
      csvText,
      defaultCourseId,
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk upload failed.";
    bulkImportStage("upload_failed", { ok: false, error: message });
    console.error("[bulk-students]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
