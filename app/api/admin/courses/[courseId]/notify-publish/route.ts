import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { verifyCronSecret } from "@/lib/cron-auth";
import { notifyProgramStudentsOfNewCourse } from "@/lib/course-program-notify";
import { createAdminClientAsync } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Send course publish notifications (in-app + Resend).
 * Awaits the full job so Vercel does not freeze mid-send (waitUntil was unreliable here).
 * Auth: admin session cookie OR Authorization: Bearer CRON_SECRET.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  const cron = verifyCronSecret(request);
  let admin;
  if (cron.ok) {
    admin = await createAdminClientAsync();
  } else {
    const auth = await requireAdminApiAuth({ lite: true });
    if ("error" in auth) return auth.error;
    admin = auth.admin;
  }

  const courseId = params.courseId?.trim();
  if (!courseId) {
    return NextResponse.json({ error: "Missing course id." }, { status: 400 });
  }

  const forceResend = request.nextUrl.searchParams.get("force") === "1";

  const { data: course, error } = await admin
    .from("courses")
    .select(
      "id, title, category_id, short_description, description, learning_outcomes, instructor_name, price_ngn, visibility, is_coming_soon",
    )
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }
  if (course.visibility !== "published" || course.is_coming_soon) {
    return NextResponse.json(
      { error: "Course must be published and not marked coming soon." },
      { status: 409 },
    );
  }

  try {
    const result = await notifyProgramStudentsOfNewCourse(course, {
      forceResend,
      sendEmails: true,
    });

    console.info(
      `[course-program-notify] sync ${courseId}: notified=${result.notified} emails=${result.emailsSent}${result.reason ? ` (${result.reason})` : ""}`,
    );

    return NextResponse.json({
      ok: true,
      courseId,
      forceResend,
      notified: result.notified,
      emailsSent: result.emailsSent,
      reason: result.reason ?? null,
      schemaNote: result.schemaNote ?? null,
      message:
        result.notified > 0
          ? `Notified ${result.notified} student(s); sent ${result.emailsSent} email(s).`
          : result.reason ?? "No notifications sent.",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[course-program-notify] sync failed:", detail);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
