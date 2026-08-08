import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";
import { getSalesPageByCourseId } from "@/lib/sales-pages/service";

type Ctx = { params: { courseId: string } };

/** Admin-only draft preview payload (never public). */
export async function GET(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-preview", 60);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const page = await getSalesPageByCourseId(auth.admin, params.courseId);
  if (!page) return NextResponse.json({ error: "Sales page not found." }, { status: 404 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "published" ? "published" : "draft";
  const schema = mode === "published" ? page.published_schema : page.draft_schema;

  return NextResponse.json({
    mode,
    status: page.status,
    draftVersion: page.draft_version,
    publishedVersion: page.published_version,
    schema,
    title: page.title,
  });
}
