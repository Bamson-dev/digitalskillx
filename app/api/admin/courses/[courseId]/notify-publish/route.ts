import { NextResponse, type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { notifyProgramStudentsOfNewCourse } from "@/lib/course-program-notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Admin kick: queue course publish notifications without blocking the browser. */
export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const courseId = params.courseId?.trim();
  if (!courseId) {
    return NextResponse.json({ error: "Missing course id." }, { status: 400 });
  }

  const forceResend = request.nextUrl.searchParams.get("force") === "1";

  const { data: course, error } = await auth.admin
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

  waitUntil(
    notifyProgramStudentsOfNewCourse(course, { forceResend, sendEmails: true })
      .then((result) => {
        console.info(
          `[course-program-notify] api kick ${courseId}: notified=${result.notified} emails=${result.emailsSent}${result.reason ? ` (${result.reason})` : ""}`,
        );
      })
      .catch((err) => {
        console.error("[course-program-notify] api kick failed:", err);
      }),
  );

  return NextResponse.json({
    ok: true,
    message: "Publish notifications are sending in the background.",
    courseId,
    forceResend,
  });
}
