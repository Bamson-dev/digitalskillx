import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { upsertSalesPageLead } from "@/lib/sales-page-leads";
import { fetchPublishedCourseById } from "@/lib/published-courses";
import { isValidStudentEmail } from "@/lib/admin-student-onboarding";

export async function POST(
  request: NextRequest,
  { params }: { params: { courseId: string } },
) {
  try {
    const limited = await rateLimitedResponse(request, "sales-page-leads", 20);
    if (limited) return limited;

    let body: {
      email?: string;
      fullName?: string;
      consent?: boolean;
      salesPageId?: string;
      attribution?: Record<string, string | number | boolean | null>;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    if (!body.consent) {
      return NextResponse.json({ error: "Consent is required." }, { status: 400 });
    }
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isValidStudentEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const course = await fetchPublishedCourseById<{ id: string; visibility: string }>(
      params.courseId,
      "id, visibility",
    );
    if (!course || course.visibility !== "published") {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }

    await bootstrapRuntimeSecrets();
    const supabase = createClient();
    const admin = await createAdminClientAsync(supabase);

    const result = await upsertSalesPageLead(admin, {
      courseId: params.courseId,
      salesPageId: body.salesPageId ?? null,
      email,
      fullName: body.fullName ? String(body.fullName) : null,
      consent: true,
      metadata: body.attribution ?? {},
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, created: result.created });
  } catch (err) {
    console.error("[sales-page-leads]", err);
    return NextResponse.json(
      { error: "Lead capture is temporarily unavailable." },
      { status: 503 },
    );
  }
}
