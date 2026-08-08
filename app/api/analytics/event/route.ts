import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-guard";
import type { Json } from "@/types/database";

const ALLOWED = new Set([
  "course_view",
  "recommendation_click",
  "browse_view",
  "enroll_cta_click",
  "certificate_view",
]);

export async function POST(request: NextRequest) {
  let body: {
    event?: string;
    courseId?: string | null;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = String(body.event ?? "");
  if (!ALLOWED.has(event)) {
    return NextResponse.json({ ok: false, error: "unknown_event" }, { status: 400 });
  }

  const courseId = body.courseId ? String(body.courseId) : null;
  const metadata = (body.metadata && typeof body.metadata === "object"
    ? body.metadata
    : {}) as Json;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync(supabase);
    const { error } = await admin.from("product_events").insert({
      event_name: event,
      course_id: courseId,
      student_id: user?.id ?? null,
      metadata,
    });

    if (error) {
      if (isMissingRelationError(error.message) || isMissingColumnError(error.message)) {
        return NextResponse.json({ ok: true, stored: false });
      }
      console.error("[analytics] insert failed", error.message);
      return NextResponse.json({ ok: true, stored: false });
    }

    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    console.error("[analytics] unexpected", err);
    return NextResponse.json({ ok: true, stored: false });
  }
}
