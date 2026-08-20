import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { runUrlLandingImport } from "@/lib/landing-import/run-import";
import type { LandingDestinationType } from "@/lib/landing-import/constants";
import { isMissingRelationError } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-landing-pages-list", 60, 60_000);
  if (limited) return limited;

  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.admin
    .from("imported_landing_pages" as never)
    .select(
      "id, title, slug, status, source_url, destination_type, destination_course_id, destination_url, created_at, published_at, import_error",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingRelationError(error.message)) {
      return NextResponse.json({
        pages: [],
        migrationRequired: true,
        error: "Apply migration 0047_imported_landing_pages.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ pages: data ?? [], migrationRequired: false });
}

export async function POST(request: NextRequest) {
  // Expensive: server-side fetch + asset mirroring. Match old sales JSON import tightness.
  const limited = await rateLimitedResponse(request, "admin-landing-url-import", 8, 60_000);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as {
    sourceUrl?: string;
    slug?: string;
    destinationType?: LandingDestinationType;
    destinationCourseId?: string;
    destinationUrl?: string;
  };

  const result = await runUrlLandingImport({
    admin: auth.admin,
    sourceUrl: String(body.sourceUrl ?? ""),
    slug: String(body.slug ?? ""),
    destinationType: (body.destinationType ?? "course_checkout") as LandingDestinationType,
    destinationCourseId: body.destinationCourseId ?? null,
    destinationUrl: body.destinationUrl ?? null,
    importedBy: auth.profile.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, pageId: result.pageId }, { status: 400 });
  }

  await logAudit({
    action: "landing_page_url_import",
    targetType: "imported_landing_page",
    targetId: result.pageId,
    metadata: { slug: body.slug, sourceUrl: body.sourceUrl },
  });

  return NextResponse.json({
    ok: true,
    pageId: result.pageId,
    report: result.report,
    ctas: result.ctas,
  });
}
