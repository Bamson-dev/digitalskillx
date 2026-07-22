import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  createBulkImportJob,
  getBulkImportJobSummary,
  processBulkImportChunk,
} from "@/lib/bulk-import-job";
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
 * - Large files: create a job and return jobId (client processes chunks).
 * - Small files / missing job tables: synchronous slim import.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimitedResponse(request, "admin-bulk-students", 20);
    if (limited) return limited;

    const auth = await requireAdminApiAuth();
    if ("error" in auth) return auth.error;

    const contentType = request.headers.get("content-type") ?? "";

    // Chunk processing / status (JSON)
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        action?: string;
        jobId?: string;
      };

      if (body.action === "status" && body.jobId) {
        const summary = await getBulkImportJobSummary(auth.admin, body.jobId);
        return NextResponse.json(summary);
      }

      if (body.action === "process" && body.jobId) {
        const summary = await processBulkImportChunk({
          admin: auth.admin,
          adminUserId: auth.user.id,
          jobId: body.jobId,
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

      return NextResponse.json({ error: "Invalid JSON action." }, { status: 400 });
    }

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

    const { rows } = parseStudentCsv(csvText);
    const dataRowCount = rows.filter((r) => r.email || r.fullName).length;
    const forceSync = String(formData.get("force_sync") ?? "") === "1";

    if (!forceSync && dataRowCount > BULK_SYNC_MAX_ROWS) {
      const created = await createBulkImportJob({
        admin: auth.admin,
        adminUserId: auth.user.id,
        csvText,
        defaultCourseId,
      });

      if ("fallbackRequired" in created) {
        return NextResponse.json(
          {
            error: `${created.reason} For now, split into files of ≤${BULK_SYNC_MAX_ROWS} rows.`,
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        jobId: created.jobId,
        totalRows: created.totalRows,
        chunked: true,
        message: `Import job created for ${created.totalRows} rows. Processing…`,
      });
    }

    // Prefer job path for medium files when tables exist
    if (!forceSync && dataRowCount > 40) {
      const created = await createBulkImportJob({
        admin: auth.admin,
        adminUserId: auth.user.id,
        csvText,
        defaultCourseId,
      });
      if (!("fallbackRequired" in created)) {
        return NextResponse.json({
          jobId: created.jobId,
          totalRows: created.totalRows,
          chunked: true,
          message: `Import job created for ${created.totalRows} rows. Processing…`,
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
    console.error("[bulk-students]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
