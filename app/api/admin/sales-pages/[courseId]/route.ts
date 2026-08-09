import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";
import {
  getOrCreateSalesPage,
  getSalesPageByCourseId,
  saveSalesPageDraft,
  publishSalesPage,
  unpublishSalesPage,
  restoreSalesPageVersion,
  restoreFromPublished,
} from "@/lib/sales-pages/service";
import { validateSalesPageForPublish, normalizeSalesPageSchema } from "@/lib/sales-pages/schema";

type Ctx = { params: { courseId: string } };

export async function GET(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-get", 120);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const page = await getSalesPageByCourseId(auth.admin, params.courseId);
  return NextResponse.json({ page });
}

export async function POST(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-create", 30);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  try {
    const page = await getOrCreateSalesPage(auth.admin, params.courseId, auth.user.id);
    return NextResponse.json({ page });
  } catch (err) {
    console.error("[sales-pages] create failed", err);
    return NextResponse.json({ error: "Could not create sales page." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-patch", 60);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  let body: {
    title?: string;
    schema?: unknown;
    seo?: unknown;
    action?: string;
    versionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.action === "publish") {
      const page = await publishSalesPage(auth.admin, params.courseId, auth.user.id);
      return NextResponse.json({ page });
    }
    if (body.action === "unpublish") {
      const page = await unpublishSalesPage(auth.admin, params.courseId);
      return NextResponse.json({ page });
    }
    if (body.action === "restore_published") {
      const page = await restoreFromPublished(auth.admin, params.courseId);
      return NextResponse.json({ page });
    }
    if (body.action === "restore_version") {
      if (!body.versionId) {
        return NextResponse.json({ error: "versionId is required." }, { status: 400 });
      }
      const page = await restoreSalesPageVersion(auth.admin, params.courseId, body.versionId);
      return NextResponse.json({ page });
    }
    if (body.action === "validate") {
      const schema = normalizeSalesPageSchema(body.schema);
      return NextResponse.json({ issues: validateSalesPageForPublish(schema) });
    }
    const page = await saveSalesPageDraft(auth.admin, params.courseId, {
      title: body.title,
      schema: body.schema as never,
      seo: body.seo as never,
    });
    return NextResponse.json({ page });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update sales page.";
    console.error("[sales-pages] patch failed", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
