import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications";
import {
  sendPaymentReceiptEmail,
  sendWelcomeEmailIfNeeded,
  sendCourseEnrollmentEmail,
} from "@/lib/system-email-triggers";
import { runAutomations } from "@/lib/automation";

function isUniqueViolation(message: string | undefined, code?: string) {
  if (code === "23505") return true;
  return Boolean(message?.toLowerCase().includes("duplicate"));
}

/** Ensure enrollment row exists for a paid purchase. Idempotent. */
export async function ensurePurchaseEnrollment(params: {
  studentId: string;
  courseId: string;
}) {
  const admin = await createAdminClientAsync();
  const { data: existing } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", params.studentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (existing) return { enrollmentId: existing.id, created: false as const };

  const { error } = await admin.from("enrollments").insert({
    student_id: params.studentId,
    course_id: params.courseId,
    source: "purchase",
  });

  if (error && !isUniqueViolation(error.message, error.code)) {
    throw new Error(`Enrollment failed after payment: ${error.message}`);
  }

  const { data: confirmed } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", params.studentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (!confirmed) {
    throw new Error("Enrollment did not save after payment fulfillment.");
  }

  return { enrollmentId: confirmed.id, created: !error };
}

/**
 * Grant course access after a verified purchase.
 * Order: enroll first, then claim pending→success (never mark success without enrollment).
 */
export async function fulfillPurchase(params: {
  studentId: string;
  courseId: string;
  reference: string;
  skipTransaction?: boolean;
  /** Included in welcome email when checkout created a new account. */
  welcomePassword?: string;
  /** Used when profile email is not set yet (guest checkout). */
  buyerEmail?: string;
  buyerName?: string;
}) {
  const admin = await createAdminClientAsync();

  const enrollment = await ensurePurchaseEnrollment({
    studentId: params.studentId,
    courseId: params.courseId,
  });

  let claimedThisRun = false;
  let alreadyFulfilled = false;

  if (!params.skipTransaction) {
    const { data: claimed } = await admin
      .from("transactions")
      .update({ status: "success" })
      .eq("reference", params.reference)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimed) {
      claimedThisRun = true;
    } else {
      const { data: tx } = await admin
        .from("transactions")
        .select("id, status")
        .eq("reference", params.reference)
        .maybeSingle();

      if (tx?.status === "success") {
        alreadyFulfilled = true;
      } else if (tx) {
        // Pending claim lost a race or status unexpected — force success only after enroll.
        await admin
          .from("transactions")
          .update({ status: "success" })
          .eq("reference", params.reference)
          .neq("status", "success");
        claimedThisRun = true;
      }
    }
  }

  // Side effects only for the winner of the claim (or first enrollment create).
  const shouldNotify = claimedThisRun || enrollment.created;

  if (shouldNotify) {
    const [{ data: profile }, { data: course }] = await Promise.all([
      admin.from("profiles").select("full_name, email").eq("id", params.studentId).single(),
      admin.from("courses").select("title").eq("id", params.courseId).single(),
    ]);

    if (course && enrollment.created) {
      await notify({
        studentId: params.studentId,
        type: "enrollment",
        title: "Purchase confirmed",
        message: `You now have access to "${course.title}".`,
        linkUrl: `/courses/${params.courseId}`,
      });
      try {
        await runAutomations("course_enrolled", {
          studentId: params.studentId,
          courseId: params.courseId,
        });
      } catch (err) {
        console.error("[fulfillPurchase] course_enrolled automation", err);
      }
    }

    const receiptEmail = profile?.email?.trim() || params.buyerEmail?.trim();
    if (receiptEmail && (claimedThisRun || enrollment.created)) {
      const welcome = await sendWelcomeEmailIfNeeded({
        studentId: params.studentId,
        fullName: params.buyerName?.trim() || profile?.full_name || "there",
        email: receiptEmail,
        password: params.welcomePassword,
        checkoutCourseId: params.courseId,
      });

      if (!welcome.sent) {
        await sendCourseEnrollmentEmail({
          studentId: params.studentId,
          courseId: params.courseId,
          fullName: params.buyerName?.trim() || profile?.full_name || "there",
          email: receiptEmail,
        });
      }

      await sendPaymentReceiptEmail({
        studentId: params.studentId,
        courseId: params.courseId,
        reference: params.reference,
      });
    }
  }

  return {
    fulfilled: true as const,
    alreadyFulfilled,
    enrollmentId: enrollment.enrollmentId,
  };
}
