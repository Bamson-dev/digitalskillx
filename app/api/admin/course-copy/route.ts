import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { generateCourseCopy } from "@/lib/ai/course-copy";
import type { CourseCopyField } from "@/lib/ai/course-copy-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_FIELDS = new Set<CourseCopyField>([
  "short_description",
  "description",
  "learning_outcomes",
  "all",
]);

async function requireAdminApi() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_suspended")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" || profile?.is_suspended) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user };
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-course-copy", 30);
  if (limited) return limited;

  const auth = await requireAdminApi();
  if ("error" in auth && auth.error) return auth.error;

  let body: {
    title?: string;
    shortDescription?: string;
    description?: string;
    learningOutcomes?: string;
    field?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const field = body.field as CourseCopyField;
  if (!field || !VALID_FIELDS.has(field)) {
    return NextResponse.json({ error: "Invalid field type." }, { status: 400 });
  }

  const result = await generateCourseCopy(
    {
      title: String(body.title ?? ""),
      shortDescription: body.shortDescription,
      description: body.description,
      learningOutcomes: body.learningOutcomes,
    },
    field,
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.data);
}
