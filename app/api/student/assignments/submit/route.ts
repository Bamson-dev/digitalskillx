import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitStudentAssignment } from "@/lib/assignment-submission";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Student assignment submission — JSON API for reliable testing and clients. */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    assignmentId?: string;
    content?: string | null;
    linkUrl?: string | null;
    fileUrl?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await submitStudentAssignment({
    studentId: user.id,
    studentEmail: user.email ?? null,
    assignmentId: String(body.assignmentId ?? ""),
    content: body.content ?? null,
    linkUrl: body.linkUrl ?? null,
    fileUrl: body.fileUrl ?? null,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  revalidatePath(`/assignments/${String(body.assignmentId)}`);
  return NextResponse.json({ ok: true, message: "Submission received." });
}
