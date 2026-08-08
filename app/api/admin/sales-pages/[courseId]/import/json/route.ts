import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";
import { getStorageService } from "@/lib/storage";
import { STORAGE_LIMITS } from "@/lib/storage/limits";
import { importSalesPageJson } from "@/lib/sales-pages/import/run-import";

type Ctx = { params: { courseId: string } };

export async function POST(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-import-json", 10, 60_000);
  if (limited) return limited;
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const contentType = request.headers.get("content-type") || "";
  let payload: unknown;
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing JSON file." }, { status: 400 });
      }
      if (file.size > STORAGE_LIMITS.maxJsonBytes) {
        return NextResponse.json({ error: "JSON file too large." }, { status: 400 });
      }
      const text = await file.text();
      payload = JSON.parse(text);
    } else {
      const buf = Buffer.from(await request.arrayBuffer());
      if (buf.byteLength > STORAGE_LIMITS.maxJsonBytes) {
        return NextResponse.json({ error: "JSON body too large." }, { status: 400 });
      }
      payload = JSON.parse(buf.toString("utf8"));
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { data: course } = await auth.admin
    .from("courses")
    .select("id, title")
    .eq("id", params.courseId)
    .maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  try {
    const storage = getStorageService();
    const result = await importSalesPageJson({
      admin: auth.admin,
      storage,
      courseId: params.courseId,
      courseTitle: course.title,
      adminUserId: auth.user.id,
      payload,
    });
    if (result.report.status === "failed") {
      return NextResponse.json({ report: result.report }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[sales-pages] json import failed", err);
    return NextResponse.json({ error: "Import failed." }, { status: 500 });
  }
}
