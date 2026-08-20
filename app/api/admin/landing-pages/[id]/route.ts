import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  publishImportedLandingPage,
  unpublishImportedLandingPage,
  updateLandingCtaMap,
} from "@/lib/landing-import/run-import";
import type { DetectedCta } from "@/lib/landing-import/constants";
import { isMissingRelationError } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const limited = await rateLimitedResponse(request, "admin-landing-page-get", 60, 60_000);
  if (limited) return limited;

  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.admin
    .from("imported_landing_pages" as never)
    .select("*")
    .eq("id", context.params.id)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return NextResponse.json({ error: "Migration 0047 required." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ page: data });
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "publish" | "unpublish" | "archive" | "update_ctas" | "retry_import";
    ctas?: DetectedCta[];
    destinationUrl?: string;
  };

  const routeKey =
    body.action === "retry_import"
      ? "admin-landing-url-import"
      : body.action === "publish" || body.action === "update_ctas"
        ? "admin-landing-page-mutate"
        : "admin-landing-page-patch";
  const limit = body.action === "retry_import" ? 8 : 30;
  const limited = await rateLimitedResponse(request, routeKey, limit, 60_000);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  try {
    if (body.action === "publish") {
      await publishImportedLandingPage(auth.admin, context.params.id);
      await logAudit({
        action: "landing_page_publish",
        targetType: "imported_landing_page",
        targetId: context.params.id,
      });
      return NextResponse.json({ ok: true, status: "published" });
    }
    if (body.action === "unpublish") {
      await unpublishImportedLandingPage(auth.admin, context.params.id);
      await logAudit({
        action: "landing_page_unpublish",
        targetType: "imported_landing_page",
        targetId: context.params.id,
      });
      return NextResponse.json({ ok: true, status: "review" });
    }
    if (body.action === "archive") {
      const { error } = await auth.admin
        .from("imported_landing_pages" as never)
        .update({ status: "archived" } as never)
        .eq("id", context.params.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, status: "archived" });
    }
    if (body.action === "update_ctas") {
      await updateLandingCtaMap(
        auth.admin,
        context.params.id,
        body.ctas ?? [],
        body.destinationUrl ?? null,
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 400 },
    );
  }
}
