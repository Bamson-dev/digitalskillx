import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { resolvePostRedeemPath } from "@/lib/enrollment-links/analytics-service";
import { recordEnrollmentEvent } from "@/lib/enrollment-links/events";
import { enrollmentLinksEnabled } from "@/lib/enrollment-links/feature-flag";
import { redeemEnrollmentLinkStrict } from "@/lib/enrollment-links/redeem-service";
import {
  buildPublicLinkView,
  EnrollmentLinkError,
  FRIENDLY_ERRORS,
  loadAndValidateEnrollmentLink,
} from "@/lib/enrollment-links/validation-service";

export const dynamic = "force-dynamic";

type Ctx = { params: { token: string } };

function featureDisabled() {
  return NextResponse.json(
    { error: "This invite is temporarily unavailable.", code: "FEATURE_DISABLED" },
    { status: 503 },
  );
}

function clientMeta(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return {
    ipAddress: ip ?? null,
    userAgent: ua || null,
    browser: ua.includes("Chrome")
      ? "Chrome"
      : ua.includes("Safari")
        ? "Safari"
        : ua.includes("Firefox")
          ? "Firefox"
          : "Other",
    device: /Mobile|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
    country: request.headers.get("x-vercel-ip-country") ?? null,
    city: request.headers.get("x-vercel-ip-city") ?? null,
  };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  if (!enrollmentLinksEnabled()) return featureDisabled();
  const limited = await rateLimitedResponse(request, "enroll-link-get", 60);
  if (limited) return limited;

  const token = decodeURIComponent(params.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: FRIENDLY_ERRORS.INVALID_LINK, code: "INVALID_LINK" }, { status: 404 });
  }

  try {
    const admin = await createAdminClientAsync();
    const loaded = await loadAndValidateEnrollmentLink(admin, token);
    const view = await buildPublicLinkView(admin, loaded.link, loaded.courseIds);

    await recordEnrollmentEvent(admin, {
      event: "link_opened",
      enrollmentLinkId: loaded.link.id,
      requestId: request.headers.get("x-request-id"),
      metadata: { accessType: loaded.link.access_type },
    });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return NextResponse.json({
      ...view,
      authenticated: Boolean(user),
      requiresAuth: true,
    });
  } catch (err) {
    if (err instanceof EnrollmentLinkError) {
      const status =
        err.code === "INVALID_LINK" || err.code === "NO_COURSES"
          ? 404
          : err.code === "UNAUTHORIZED"
            ? 401
            : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json(
      { error: FRIENDLY_ERRORS.ENROLLMENT_FAILED, code: "ENROLLMENT_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  if (!enrollmentLinksEnabled()) return featureDisabled();
  const limited = await rateLimitedResponse(request, "enroll-link-redeem", 20);
  if (limited) return limited;

  const token = decodeURIComponent(params.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: FRIENDLY_ERRORS.INVALID_LINK, code: "INVALID_LINK" }, { status: 404 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: FRIENDLY_ERRORS.UNAUTHORIZED, code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  try {
    const admin = await createAdminClientAsync(supabase);
    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, full_name, role, is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "student") {
      return NextResponse.json(
        { error: "Only student accounts can use enrollment invites.", code: "UNAUTHORIZED" },
        { status: 403 },
      );
    }
    if (profile.is_suspended) {
      return NextResponse.json(
        { error: "Your account is suspended.", code: "UNAUTHORIZED" },
        { status: 403 },
      );
    }

    const meta = clientMeta(request);
    const result = await redeemEnrollmentLinkStrict(admin, {
      token,
      userId: user.id,
      email: profile.email,
      fullName: profile.full_name ?? "there",
      ...meta,
      requestId: request.headers.get("x-request-id") ?? undefined,
    });

    const redirectTo = resolvePostRedeemPath(result);

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      newlyEnrolled: result.newlyEnrolled,
      alreadyEnrolled: result.alreadyEnrolled,
      courses: result.courses,
      redirectTo,
      correlationId: result.correlationId,
    });
  } catch (err) {
    if (err instanceof EnrollmentLinkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : FRIENDLY_ERRORS.ENROLLMENT_FAILED,
        code: "ENROLLMENT_FAILED",
      },
      { status: 500 },
    );
  }
}
