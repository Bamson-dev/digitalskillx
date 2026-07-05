import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Delete one or more lessons from a course (admin-only). */
export async function DELETE(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-lesson-delete", 60);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: { courseId?: string; lessonIds?: string[] };
  try {
    body = (await request.json()) as { courseId?: string; lessonIds?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const courseId = String(body.courseId ?? "").trim();
  const lessonIds = [...new Set((body.lessonIds ?? []).map((id) => String(id).trim()).filter(Boolean))];

  if (!courseId || lessonIds.length === 0) {
    return NextResponse.json({ error: "courseId and lessonIds are required." }, { status: 400 });
  }

  const { error } = await auth.admin.from("lessons").delete().in("id", lessonIds);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: lessonIds.length === 1 ? "lesson_deleted" : "lessons_bulk_deleted",
    targetType: "course",
    targetId: courseId,
    metadata: { lesson_ids: lessonIds, count: lessonIds.length },
  });

  return NextResponse.json({ deleted: lessonIds.length });
}
