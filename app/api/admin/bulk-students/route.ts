import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { readCsvFromFormData, runBulkStudentCsvUpload } from "@/lib/bulk-student-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** CSV bulk student import — admin-only JSON API (reliable file upload + fetch clients). */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimitedResponse(request, "admin-bulk-students", 10);
    if (limited) return limited;

    const auth = await requireAdminApiAuth();
    if ("error" in auth) return auth.error;

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
