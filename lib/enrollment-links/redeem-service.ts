import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrollStudent } from "@/lib/enrollment-engine";
import { recordEnrollmentEvent } from "@/lib/enrollment-links/events";
import {
  assertAccessType,
  buildPublicLinkView,
  EnrollmentLinkError,
  FRIENDLY_ERRORS,
  isImportedStudentEligible,
  loadAndValidateEnrollmentLink,
} from "@/lib/enrollment-links/validation-service";
import type { Database } from "@/types/database";

export type RedeemContext = {
  token: string;
  userId: string;
  email: string;
  fullName: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  device?: string | null;
  country?: string | null;
  city?: string | null;
  correlationId?: string;
  requestId?: string;
};

/**
 * Redeem an enrollment link for an authenticated student.
 * Uses claim_enrollment_link_redemption for row lock + idempotency.
 */
export async function redeemEnrollmentLink(
  admin: SupabaseClient<Database>,
  ctx: RedeemContext,
) {
  const correlationId = ctx.correlationId ?? crypto.randomUUID();

  await recordEnrollmentEvent(admin, {
    event: "redemption_attempt",
    userId: ctx.userId,
    correlationId,
    requestId: ctx.requestId,
    metadata: { email: ctx.email },
  });

  let linkId: string | null = null;
  let courseIds: string[] = [];

  try {
    const loaded = await loadAndValidateEnrollmentLink(admin, ctx.token);
    linkId = loaded.link.id;
    courseIds = loaded.courseIds;

    if (loaded.link.access_type === "imported_students") {
      const eligible = await isImportedStudentEligible(admin, ctx.email);
      assertAccessType(loaded.link.access_type, eligible);
    }

    // Enroll first so we never increment redemption without granting access.
    const enrollResult = await enrollStudent(admin, {
      studentId: ctx.userId,
      email: ctx.email,
      fullName: ctx.fullName,
      courseIds,
      source: "enrollment_link",
      options: {
        reconcile: true,
        skipCheck: "email",
        notify: true,
        emailMode: "welcome_or_enrollment",
        automations: true,
        notifyTitle: "Welcome",
        correlationId,
      },
    });

    const { data: claim, error: claimError } = await admin.rpc(
      "claim_enrollment_link_redemption",
      {
        p_link_id: loaded.link.id,
        p_user_id: ctx.userId,
        p_email: ctx.email,
        p_ip: ctx.ipAddress ?? null,
        p_user_agent: ctx.userAgent ?? null,
        p_browser: ctx.browser ?? null,
        p_device: ctx.device ?? null,
        p_country: ctx.country ?? null,
        p_city: ctx.city ?? null,
      },
    );

    if (claimError) throw new Error(claimError.message);

    const claimResult = claim as {
      ok?: boolean;
      idempotent?: boolean;
      code?: string;
      redemption_id?: string;
    } | null;

    if (!claimResult?.ok) {
      const code = (claimResult?.code ?? "ENROLLMENT_FAILED") as keyof typeof FRIENDLY_ERRORS;
      // Access already granted; treat limit/disabled after enroll as soft — still success for student
      if (code === "LIMIT_REACHED" || code === "DISABLED" || code === "EXPIRED") {
        // Race: someone else took the last slot after our enroll. Keep access; log.
        await recordEnrollmentEvent(admin, {
          event: "redemption_failed",
          enrollmentLinkId: linkId,
          userId: ctx.userId,
          correlationId,
          metadata: { code, note: "enrolled_but_claim_failed" },
        });
      } else {
        throw new EnrollmentLinkError(
          code in FRIENDLY_ERRORS ? code : "ENROLLMENT_FAILED",
          FRIENDLY_ERRORS[code in FRIENDLY_ERRORS ? code : "ENROLLMENT_FAILED"],
        );
      }
    }

    const idempotent = Boolean(claimResult?.idempotent);

    await recordEnrollmentEvent(admin, {
      event: "redemption_success",
      enrollmentLinkId: linkId,
      userId: ctx.userId,
      correlationId,
      metadata: {
        newlyEnrolled: enrollResult.newlyEnrolled,
        alreadyEnrolled: enrollResult.alreadyEnrolled,
        idempotent,
      },
    });

    const view = await buildPublicLinkView(admin, loaded.link, courseIds);

    return {
      ok: true as const,
      idempotent,
      linkId: loaded.link.id,
      newlyEnrolled: enrollResult.newlyEnrolled,
      alreadyEnrolled: enrollResult.alreadyEnrolled,
      redirectType: loaded.link.redirect_type,
      redirectCourseId: loaded.link.redirect_course_id,
      courses: view.courses,
      correlationId,
    };
  } catch (err) {
    const code =
      err instanceof EnrollmentLinkError ? err.code : "ENROLLMENT_FAILED";
    await recordEnrollmentEvent(admin, {
      event: "redemption_failed",
      enrollmentLinkId: linkId,
      userId: ctx.userId,
      correlationId,
      metadata: {
        code,
        message: err instanceof Error ? err.message.slice(0, 200) : String(err),
      },
    });
    throw err;
  }
}

/**
 * Prefer claim-then-enroll for strict max-redemption accounting.
 * Used when we must not grant access if the link is exhausted.
 */
export async function redeemEnrollmentLinkStrict(
  admin: SupabaseClient<Database>,
  ctx: RedeemContext,
) {
  const correlationId = ctx.correlationId ?? crypto.randomUUID();

  await recordEnrollmentEvent(admin, {
    event: "redemption_attempt",
    userId: ctx.userId,
    correlationId,
    requestId: ctx.requestId,
  });

  const loaded = await loadAndValidateEnrollmentLink(admin, ctx.token);

  if (loaded.link.access_type === "imported_students") {
    const eligible = await isImportedStudentEligible(admin, ctx.email);
    assertAccessType(loaded.link.access_type, eligible);
  }

  // Idempotent existing redemption → enroll (skip owned) without re-increment
  const { data: existing } = await admin
    .from("enrollment_link_redemptions")
    .select("id")
    .eq("enrollment_link_id", loaded.link.id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (existing) {
    const enrollResult = await enrollStudent(admin, {
      studentId: ctx.userId,
      email: ctx.email,
      fullName: ctx.fullName,
      courseIds: loaded.courseIds,
      source: "enrollment_link",
      options: {
        reconcile: true,
        skipCheck: "email",
        notify: false,
        emailMode: "none",
        automations: false,
      },
    });
    const view = await buildPublicLinkView(admin, loaded.link, loaded.courseIds);
    return {
      ok: true as const,
      idempotent: true,
      linkId: loaded.link.id,
      newlyEnrolled: enrollResult.newlyEnrolled,
      alreadyEnrolled: enrollResult.alreadyEnrolled,
      redirectType: loaded.link.redirect_type,
      redirectCourseId: loaded.link.redirect_course_id,
      courses: view.courses,
      correlationId,
    };
  }

  const { data: claim, error: claimError } = await admin.rpc(
    "claim_enrollment_link_redemption",
    {
      p_link_id: loaded.link.id,
      p_user_id: ctx.userId,
      p_email: ctx.email,
      p_ip: ctx.ipAddress ?? null,
      p_user_agent: ctx.userAgent ?? null,
      p_browser: ctx.browser ?? null,
      p_device: ctx.device ?? null,
      p_country: ctx.country ?? null,
      p_city: ctx.city ?? null,
    },
  );
  if (claimError) throw new Error(claimError.message);

  const claimResult = claim as { ok?: boolean; idempotent?: boolean; code?: string } | null;
  if (!claimResult?.ok) {
    const code = (claimResult?.code ?? "ENROLLMENT_FAILED") as keyof typeof FRIENDLY_ERRORS;
    throw new EnrollmentLinkError(
      code in FRIENDLY_ERRORS ? code : "ENROLLMENT_FAILED",
      FRIENDLY_ERRORS[code in FRIENDLY_ERRORS ? code : "ENROLLMENT_FAILED"],
    );
  }

  const enrollResult = await enrollStudent(admin, {
    studentId: ctx.userId,
    email: ctx.email,
    fullName: ctx.fullName,
    courseIds: loaded.courseIds,
    source: "enrollment_link",
    options: {
      reconcile: true,
      skipCheck: "email",
      notify: true,
      emailMode: claimResult.idempotent ? "none" : "welcome_or_enrollment",
      automations: !claimResult.idempotent,
      notifyTitle: "Welcome",
      correlationId,
    },
  });

  await recordEnrollmentEvent(admin, {
    event: "redemption_success",
    enrollmentLinkId: loaded.link.id,
    userId: ctx.userId,
    correlationId,
    metadata: {
      newlyEnrolled: enrollResult.newlyEnrolled,
      alreadyEnrolled: enrollResult.alreadyEnrolled,
      idempotent: Boolean(claimResult.idempotent),
    },
  });

  const view = await buildPublicLinkView(admin, loaded.link, loaded.courseIds);
  return {
    ok: true as const,
    idempotent: Boolean(claimResult.idempotent),
    linkId: loaded.link.id,
    newlyEnrolled: enrollResult.newlyEnrolled,
    alreadyEnrolled: enrollResult.alreadyEnrolled,
    redirectType: loaded.link.redirect_type,
    redirectCourseId: loaded.link.redirect_course_id,
    courses: view.courses,
    correlationId,
  };
}
