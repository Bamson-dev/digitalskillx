import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { createDraftAssignment, publishDraftAssignment } from "@/lib/assignments-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateBody = {
  action: "create";
  courseId: string;
  moduleId?: string | null;
  title: string;
  instructions?: string | null;
  dueDate?: string | null;
  submissionTypes?: string[];
};

type PublishBody = {
  action: "publish";
  assignmentId: string;
};

/** Admin assignment create (draft) and publish with JSON responses. */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-assignments", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: CreateBody | PublishBody;
  try {
    body = (await request.json()) as CreateBody | PublishBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action === "create") {
    const result = await createDraftAssignment(auth.admin, {
      courseId: body.courseId,
      moduleId: body.moduleId,
      title: body.title,
      instructions: body.instructions,
      dueDate: body.dueDate,
      submissionTypes: body.submissionTypes,
    });

    if ("error" in result) {
      const message = result.error ?? "Unknown error";
      const status = /migration is missing/i.test(message) ? 503 : 400;
      return NextResponse.json({ error: message }, { status });
    }

    revalidatePath("/admin/assignments");
    return NextResponse.json({
      ok: true,
      assignment: result.assignment,
      message: "Draft assignment created. Publish when ready for students to see it.",
    });
  }

  if (body.action === "publish") {
    const result = await publishDraftAssignment(auth.admin, body.assignmentId);

    if ("error" in result) {
      const message = result.error ?? "Unknown error";
      const status = /migration is missing/i.test(message)
        ? 503
        : /already published|not found/i.test(message)
          ? 400
          : 400;
      return NextResponse.json({ error: message }, { status });
    }

    await logAudit({
      action: "assignment_published",
      metadata: {
        assignmentId: result.assignment.id,
        courseId: result.assignment.course_id,
        notified: result.delivery.notified,
        emailsSent: result.delivery.emailsSent,
      },
    });

    revalidatePath("/admin/assignments");
    return NextResponse.json({
      ok: true,
      assignment: result.assignment,
      notified: result.delivery.notified,
      emailsSent: result.delivery.emailsSent,
      message: `Published. ${result.delivery.notified} student notification(s), ${result.delivery.emailsSent} email(s) sent.`,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
