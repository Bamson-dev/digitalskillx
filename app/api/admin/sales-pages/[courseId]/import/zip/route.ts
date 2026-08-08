import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";
import { getStorageService } from "@/lib/storage";
import { STORAGE_LIMITS } from "@/lib/storage/limits";
import { importSalesPageZip } from "@/lib/sales-pages/import/run-import";

type Ctx = { params: { courseId: string } };

export async function POST(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-import-zip", 8, 60_000);
  if (limited) return limited;
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let zipBytes: Uint8Array;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing ZIP file." }, { status: 400 });
    }
    if (file.size > STORAGE_LIMITS.maxZipBytes) {
      return NextResponse.json({ error: "ZIP file too large." }, { status: 400 });
    }
    zipBytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read ZIP upload." }, { status: 400 });
  }

  const { data: course } = await auth.admin
    .from("courses")
    .select("id, title")
    .eq("id", params.courseId)
    .maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  try {
    const storage = getStorageService();
    const result = await importSalesPageZip({
      admin: auth.admin,
      storage,
      courseId: params.courseId,
      courseTitle: course.title,
      adminUserId: auth.user.id,
      zipBytes,
    });
    if (result.report.status === "failed") {
      return NextResponse.json({ report: result.report }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[sales-pages] zip import failed", err);
    return NextResponse.json({ error: "ZIP import failed." }, { status: 500 });
  }
}
