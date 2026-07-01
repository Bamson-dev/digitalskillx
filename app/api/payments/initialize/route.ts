import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initializeTransaction, generateReference } from "@/lib/paystack";
import { isCourseFree, nairaToKobo, type CurrencyCode } from "@/lib/currency";
import { fulfillPurchase } from "@/lib/purchase";
import { siteUrl } from "@/lib/org";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "payments-initialize", 30);
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { courseId?: string; currency?: CurrencyCode };
  if (!body.courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  const requestedCurrency: CurrencyCode = body.currency === "USD" ? "USD" : "NGN";

  if (requestedCurrency === "USD") {
    return NextResponse.json({ error: "USD payments are not available yet" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .single();
  if (!profile?.email) {
    return NextResponse.json({ error: "Profile email required" }, { status: 400 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, price_ngn, price_usd, visibility")
    .eq("id", body.courseId)
    .single();

  if (!course || course.visibility !== "published") {
    return NextResponse.json({ error: "Course not available" }, { status: 404 });
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();

  if (enrollment) {
    return NextResponse.json({ enrolled: true });
  }

  const admin = createAdminClient();

  if (isCourseFree(course, "NGN")) {
    const { data: existing } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();
    if (!existing) {
      await admin.from("enrollments").insert({
        student_id: user.id,
        course_id: course.id,
        source: "purchase",
      });
    }
    const reference = generateReference();
    await fulfillPurchase({
      studentId: user.id,
      courseId: course.id,
      reference,
      skipTransaction: true,
    });
    return NextResponse.json({ enrolled: true });
  }

  if (!process.env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }

  const chargeAmount = nairaToKobo(course.price_ngn);

  if (chargeAmount <= 0) {
    return NextResponse.json({ error: "Course price not set" }, { status: 400 });
  }

  const reference = generateReference();

  const { error: txError } = await admin.from("transactions").insert({
    student_id: user.id,
    course_id: course.id,
    amount: chargeAmount,
    currency: "NGN",
    reference,
    status: "pending",
  });
  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  try {
    const init = await initializeTransaction({
      email: profile.email,
      amountMinor: chargeAmount,
      currency: "NGN",
      reference,
      callbackUrl: `${siteUrl()}/course/${course.id}?payment=success`,
      metadata: {
        student_id: user.id,
        course_id: course.id,
        currency: "NGN",
      },
    });
    return NextResponse.json({
      authorizationUrl: init.authorization_url,
      reference,
    });
  } catch (err) {
    await admin.from("transactions").update({ status: "failed" }).eq("reference", reference);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payment initialization failed" },
      { status: 500 },
    );
  }
}
