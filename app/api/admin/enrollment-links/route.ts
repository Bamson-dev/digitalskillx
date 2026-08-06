import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import { enrollmentLinksEnabled } from "@/lib/enrollment-links/feature-flag";
import {
  createEnrollmentLink,
  listEnrollmentLinks,
} from "@/lib/enrollment-links/link-service";
import type {
  EnrollmentLinkAccess,
  EnrollmentLinkRedirect,
  EnrollmentLinkStatus,
} from "@/types/database";

export const dynamic = "force-dynamic";

function featureDisabled() {
  return NextResponse.json(
    { error: "Enrollment Links are disabled.", code: "FEATURE_DISABLED" },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  if (!enrollmentLinksEnabled()) return featureDisabled();

  const limited = await rateLimitedResponse(request, "admin-enrollment-links", 120);
  if (limited) return limited;

  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const sp = request.nextUrl.searchParams;
  try {
    const links = await listEnrollmentLinks(auth.admin, {
      search: sp.get("search") ?? undefined,
      status: (sp.get("status") as EnrollmentLinkStatus | "all") || "all",
      accessType: (sp.get("accessType") as EnrollmentLinkAccess | "all") || "all",
      sort:
        (sp.get("sort") as "newest" | "oldest" | "most_redeemed" | "expiring_soon") ||
        "newest",
    });
    return NextResponse.json({ links });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list links." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!enrollmentLinksEnabled()) return featureDisabled();

  const limited = await rateLimitedResponse(request, "admin-enrollment-links-create", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: {
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
    const result = await createEnrollmentLink(auth.admin, {
      name: String(body.name ?? ""),
      description: body.description,
      courseIds: body.courseIds ?? [],
      maxRedemptions: body.maxRedemptions ?? null,
      expiresAt: body.expiresAt ?? null,
      status: body.status ?? "active",
      accessType: body.accessType ?? "public",
      redirectType: body.redirectType ?? "success_page",
      redirectCourseId: body.redirectCourseId ?? null,
      createdBy: auth.user.id,
    });

    await logAudit({
      action: "enrollment_link_created",
      targetType: "enrollment_link",
      targetId: result.link.id,
      metadata: { name: result.link.name },
    });

    return NextResponse.json({
      link: result.link,
      plaintextToken: result.plaintextToken,
      url: result.url,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create link." },
      { status: 400 },
    );
  }
}
