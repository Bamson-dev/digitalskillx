import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import { getEnrollmentLinkAnalytics } from "@/lib/enrollment-links/analytics-service";
import { enrollmentLinksEnabled } from "@/lib/enrollment-links/feature-flag";
import {
  duplicateEnrollmentLink,
  getEnrollmentLinkById,
  setEnrollmentLinkEnabled,
  softDeleteEnrollmentLink,
  updateEnrollmentLink,
} from "@/lib/enrollment-links/link-service";
import type { EnrollmentLinkAccess, EnrollmentLinkRedirect, EnrollmentLinkStatus } from "@/types/database";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

function featureDisabled() {
  return NextResponse.json(
    { error: "Enrollment Links are disabled.", code: "FEATURE_DISABLED" },
    { status: 503 },
  );
}

export async function GET(request: NextRequest, { params }: Ctx) {
  if (!enrollmentLinksEnabled()) return featureDisabled();
  const limited = await rateLimitedResponse(request, "admin-enrollment-link-get", 120);
  if (limited) return limited;

  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const withAnalytics = request.nextUrl.searchParams.get("analytics") === "1";

  try {
    const detail = await getEnrollmentLinkById(auth.admin, params.id);
    if (!detail) {
      return NextResponse.json({ error: "Link not found." }, { status: 404 });
    }
    const analytics = withAnalytics
      ? await getEnrollmentLinkAnalytics(auth.admin, params.id)
      : undefined;
    return NextResponse.json({ ...detail, analytics });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load link." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!enrollmentLinksEnabled()) return featureDisabled();
  const limited = await rateLimitedResponse(request, "admin-enrollment-link-patch", 60);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: {
    action?: "enable" | "disable" | "duplicate" | "update";
    name?: string;
    description?: string;
    courseIds?: string[];
    maxRedemptions?: number | null;
    expiresAt?: string | null;
    status?: EnrollmentLinkStatus;
    accessType?: EnrollmentLinkAccess;
    redirectType?: EnrollmentLinkRedirect;
    redirectCourseId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.action === "enable" || body.action === "disable") {
      await setEnrollmentLinkEnabled(
        auth.admin,
        params.id,
        body.action === "enable",
        auth.user.id,
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "duplicate") {
      const result = await duplicateEnrollmentLink(auth.admin, params.id, auth.user.id);
      await logAudit({
        action: "enrollment_link_duplicated",
        targetType: "enrollment_link",
        targetId: result.link.id,
        metadata: { from: params.id },
      });
      return NextResponse.json({
        link: result.link,
        plaintextToken: result.plaintextToken,
        url: result.url,
      });
    }

    const link = await updateEnrollmentLink(
      auth.admin,
      params.id,
      {
        name: body.name,
        description: body.description,
        courseIds: body.courseIds,
        maxRedemptions: body.maxRedemptions,
        expiresAt: body.expiresAt,
        status: body.status,
        accessType: body.accessType,
        redirectType: body.redirectType,
        redirectCourseId: body.redirectCourseId,
      },
      auth.user.id,
    );
    return NextResponse.json({ link });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!enrollmentLinksEnabled()) return featureDisabled();
  const limited = await rateLimitedResponse(request, "admin-enrollment-link-delete", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  try {
    await softDeleteEnrollmentLink(auth.admin, params.id, auth.user.id);
    await logAudit({
      action: "enrollment_link_deleted",
      targetType: "enrollment_link",
      targetId: params.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed." },
      { status: 400 },
    );
  }
}
