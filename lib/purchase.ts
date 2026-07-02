import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import { sendPaymentReceiptEmail, sendWelcomeEmailIfNeeded } from "@/lib/system-email-triggers";

/** Grant course access after a verified purchase. Idempotent for webhook retries. */
export async function fulfillPurchase(params: {
  studentId: string;
  courseId: string;
  reference: string;
  skipTransaction?: boolean;
}) {
  const admin = createAdminClient();

  if (!params.skipTransaction) {
    const { data: tx } = await admin
      .from("transactions")
      .select("id, status")
      .eq("reference", params.reference)
      .maybeSingle();

    if (tx?.status === "success") return { alreadyFulfilled: true };

    await admin
      .from("transactions")
      .update({ status: "success" })
      .eq("reference", params.reference);
  }

  const { data: existing } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", params.studentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (!existing) {
    await admin.from("enrollments").insert({
      student_id: params.studentId,
      course_id: params.courseId,
      source: "purchase",
    });
  }

  const [{ data: profile }, { data: course }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", params.studentId).single(),
    admin.from("courses").select("title").eq("id", params.courseId).single(),
  ]);

  if (course) {
    await notify({
      studentId: params.studentId,
      type: "enrollment",
      title: "Purchase confirmed",
      message: `You now have access to "${course.title}".`,
      linkUrl: `/courses/${params.courseId}`,
    });
  }

  if (profile?.email) {
    void sendWelcomeEmailIfNeeded({
      studentId: params.studentId,
      fullName: profile.full_name ?? "there",
      email: profile.email,
      checkoutCourseId: params.courseId,
    });

    void sendPaymentReceiptEmail({
      studentId: params.studentId,
      courseId: params.courseId,
      reference: params.reference,
    });
  }

  return { fulfilled: true };
}
