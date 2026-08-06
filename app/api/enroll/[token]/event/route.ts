import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { enrollmentLinksEnabled } from "@/lib/enrollment-links/feature-flag";
import { recordEnrollmentEvent } from "@/lib/enrollment-links/events";
import { hashEnrollmentLinkToken } from "@/lib/enrollment-links/token";

export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "registration_started",
  "registration_completed",
  "login_started",
  "login_completed",
  "continue_learning",
]);

type Ctx = { params: { token: string } };

/** Funnel analytics for public enroll pages — best-effort, never blocks UX. */
export async function POST(request: NextRequest, { params }: Ctx) {
  if (!enrollmentLinksEnabled()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const limited = await rateLimitedResponse(request, "enroll-link-event", 60);
  if (limited) return limited;

  const token = decodeURIComponent(params.token ?? "").trim();
  let event = "";
  try {
    const body = (await request.json()) as { event?: string };
    event = String(body.event ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!ALLOWED.has(event) || !token) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  try {
    const admin = await createAdminClientAsync();
    const tokenHash = hashEnrollmentLinkToken(token);
    const { data: link } = await admin
      .from("enrollment_links")
      .select("id")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!link) return NextResponse.json({ ok: true }); // do not leak validity

    await recordEnrollmentEvent(admin, {
      event,
      enrollmentLinkId: link.id,
      requestId: request.headers.get("x-request-id"),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
