import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { resolveOrCreateStudentForPurchase } from "@/lib/guest-checkout";
import { fulfillPurchase } from "@/lib/purchase";
import { sendMagicLinkEmail } from "@/lib/auth-email";
import { siteUrl } from "@/lib/org";
import { secureLog } from "@/lib/secure-log";
import {
  BUILD_SOFTWARE_WITH_AI_PRODUCT,
  configuredExternalCourseId,
  identifyPaystackExternalProduct,
  readExternalPaystackData,
  type ExternalFulfillmentStatus,
  type PaystackChargePayload,
  PAYSTACK_EXTERNAL_PRODUCTS,
} from "@/lib/paystack-external-products";
import { sendPaystackCourseAccessEmail } from "@/lib/system-email-triggers";
import { verifyTransaction } from "@/lib/paystack";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type ExternalFulfillmentResult =
  | { handled: false }
  | {
      handled: true;
      ok: true;
      reference: string;
      alreadyFulfilled?: boolean;
      productKey: string;
      courseId: string;
      studentId: string;
    }
  | {
      handled: true;
      ok: false;
      reference: string;
      error: string;
      permanent?: boolean;
      status: number;
    };

function buyerNameFromCharge(data: PaystackChargePayload | null, verifiedCustomer?: VerifiedTransactionCustomer) {
  const first =
    data?.customer?.first_name?.trim() ||
    verifiedCustomer?.first_name?.trim() ||
    "";
  const last =
    data?.customer?.last_name?.trim() ||
    verifiedCustomer?.last_name?.trim() ||
    "";
  const combined = `${first} ${last}`.trim();
  return combined || null;
}

type VerifiedTransactionCustomer = {
  first_name?: string;
  last_name?: string;
  email?: string;
};

async function resolveCourseForProduct(admin: Admin, productKey: string, courseId: string) {
  const { data: course } = await admin
    .from("courses")
    .select("id, title, visibility")
    .eq("id", courseId)
    .maybeSingle();
  if (course) return course;

  const product =
    productKey === BUILD_SOFTWARE_WITH_AI_PRODUCT.key
      ? BUILD_SOFTWARE_WITH_AI_PRODUCT
      : PAYSTACK_EXTERNAL_PRODUCTS.find((row) => row.key === productKey);
  if (!product) return null;

  for (const alias of product.titleAliases) {
    const { data: byTitle } = await admin
      .from("courses")
      .select("id, title, visibility")
      .ilike("title", alias)
      .maybeSingle();
    if (byTitle) return byTitle;
  }
  return null;
}

async function patchTransactionPaystackData(
  admin: Admin,
  reference: string,
  patch: Record<string, unknown>,
) {
  const { data: tx } = await admin
    .from("transactions")
    .select("paystack_data")
    .eq("reference", reference)
    .maybeSingle();
  const existing =
    tx?.paystack_data && typeof tx.paystack_data === "object"
      ? (tx.paystack_data as Record<string, unknown>)
      : {};
  await admin
    .from("transactions")
    .update({
      paystack_data: { ...existing, ...patch } as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("reference", reference);
}

async function enrollmentExists(admin: Admin, studentId: string, courseId: string) {
  const { data } = await admin
    .from("enrollments")
    .select("id, created_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();
  return data;
}

async function sendAccessEmail(params: {
  studentId: string;
  email: string;
  firstName: string;
  courseId: string;
  courseTitle: string;
  isNewAccount: boolean;
}) {
  const base = siteUrl();
  const courseUrl = `${base}/courses/${params.courseId}`;
  const loginUrl = `${base}/login?next=${encodeURIComponent(courseUrl)}`;

  if (params.isNewAccount) {
    await sendMagicLinkEmail(params.email, `/courses/${params.courseId}`);
  }

  return sendPaystackCourseAccessEmail({
    email: params.email,
    firstName: params.firstName,
    courseTitle: params.courseTitle,
    courseUrl,
    loginUrl,
    isNewAccount: params.isNewAccount,
  });
}

/**
 * Fulfill Paystack Payment Page purchases (e.g. paystack.shop/pay/aiapp).
 * Idempotent on Paystack reference and student+course enrollment.
 */
export async function fulfillPaystackExternalCharge(params: {
  reference: string;
  webhookEvent?: string;
  webhookData?: PaystackChargePayload | null;
  admin?: Admin;
}): Promise<ExternalFulfillmentResult> {
  const admin = params.admin ?? (await createAdminClientAsync());
  const reference = params.reference.trim();
  if (!reference) return { handled: false };

  secureLog("info", "paystack/external", "payment_received", {
    reference,
    event: params.webhookEvent ?? "charge.success",
  });

  const verified = await verifyTransaction(reference, admin);
  if (!verified) {
    secureLog("warn", "paystack/external", "payment_rejected", {
      reference,
      reason: "verify_failed",
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: "Transaction could not be verified.",
      permanent: false,
      status: 409,
    };
  }

  if (verified.status !== "success") {
    secureLog("warn", "paystack/external", "payment_rejected", {
      reference,
      reason: "not_success",
      status: verified.status,
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: `Payment status is ${verified.status}.`,
      permanent: verified.status === "failed",
      status: verified.status === "failed" ? 200 : 409,
    };
  }

  const product = identifyPaystackExternalProduct({
    verified,
    webhookData: params.webhookData ?? null,
  });
  if (!product) {
    secureLog("info", "paystack/external", "payment_rejected", {
      reference,
      reason: "unknown_product",
      amount: verified.amount,
      currency: verified.currency,
    });
    return { handled: false };
  }

  const courseId = configuredExternalCourseId(product);
  const course = await resolveCourseForProduct(admin, product.key, courseId);
  if (!course) {
    secureLog("error", "paystack/external", "fulfillment_failed", {
      reference,
      reason: "course_not_found",
      courseId,
      productKey: product.key,
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: "Mapped course was not found.",
      permanent: true,
      status: 422,
    };
  }

  if (course.visibility !== "published") {
    secureLog("error", "paystack/external", "fulfillment_failed", {
      reference,
      reason: "course_not_published",
      courseId: course.id,
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: "Course is not published.",
      permanent: true,
      status: 422,
    };
  }

  secureLog("info", "paystack/external", "payment_verified", {
    reference,
    productKey: product.key,
    courseId: course.id,
  });

  const buyerEmail =
    verified.metadata?.buyer_email?.trim().toLowerCase() ||
    verified.customer?.email?.trim().toLowerCase() ||
    params.webhookData?.customer?.email?.trim().toLowerCase() ||
    "";
  const buyerName = buyerNameFromCharge(params.webhookData ?? null, verified.customer);

  const { data: existingTx } = await admin
    .from("transactions")
    .select("id, status, student_id, course_id, paystack_data")
    .eq("reference", reference)
    .maybeSingle();

  const externalMeta = readExternalPaystackData(existingTx?.paystack_data);
  if (existingTx?.status === "success" && existingTx.student_id && existingTx.course_id) {
    const enrolled = await enrollmentExists(admin, existingTx.student_id, existingTx.course_id);
    if (enrolled) {
      secureLog("info", "paystack/external", "duplicate_payment", { reference });
      if (!externalMeta?.access_email_sent_at && buyerEmail) {
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", existingTx.student_id)
          .maybeSingle();
        await sendAccessEmail({
          studentId: existingTx.student_id,
          email: buyerEmail,
          firstName: profile?.full_name?.split(/\s+/)[0] ?? "there",
          courseId: existingTx.course_id,
          courseTitle: course.title,
          isNewAccount: false,
        });
        await patchTransactionPaystackData(admin, reference, {
          fulfillment_status: "email_sent",
          access_email_sent_at: new Date().toISOString(),
        });
      }
      return {
        handled: true,
        ok: true,
        reference,
        alreadyFulfilled: true,
        productKey: product.key,
        courseId: existingTx.course_id,
        studentId: existingTx.student_id,
      };
    }
  }

  if (!buyerEmail) {
    await patchTransactionPaystackData(admin, reference, {
      source: "paystack_payment_page",
      product_key: product.key,
      fulfillment_status: "fulfillment_failed",
      fulfillment_error: "missing_customer_email",
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: "Customer email missing from verified transaction.",
      permanent: true,
      status: 422,
    };
  }

  let studentId = existingTx?.student_id ?? null;
  let isNewAccount = false;

  try {
    const resolved = await resolveOrCreateStudentForPurchase(admin, {
      email: buyerEmail,
      fullName: buyerName,
    });
    studentId = resolved.studentId;
    isNewAccount = resolved.isNewAccount;
    secureLog("info", "paystack/external", isNewAccount ? "user_created" : "user_found", {
      reference,
      productKey: product.key,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    secureLog("error", "paystack/external", "fulfillment_failed", {
      reference,
      reason: "user_resolution_failed",
      error: message,
    });
    await patchTransactionPaystackData(admin, reference, {
      source: "paystack_payment_page",
      product_key: product.key,
      fulfillment_status: "fulfillment_failed",
      fulfillment_error: message,
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: message,
      permanent: false,
      status: 500,
    };
  }

  const paystackData: Record<string, unknown> = {
    source: "paystack_payment_page",
    product_key: product.key,
    payment_page: product.paymentPageUrl,
    fulfillment_status: "payment_verified" as ExternalFulfillmentStatus,
    paystack_transaction_id: params.webhookData?.id ?? null,
    webhook_event: params.webhookEvent ?? "charge.success",
    paid_at: params.webhookData?.paid_at ?? new Date().toISOString(),
    customer_email: buyerEmail,
    checkout_email: buyerEmail,
    checkout_full_name: buyerName,
    ...(params.webhookData ?? {}),
  };

  if (!existingTx) {
    const { error: insertError } = await admin.from("transactions").insert({
      student_id: studentId,
      course_id: course.id,
      amount: product.expectedAmountKobo,
      currency: product.currency,
      provider: "paystack",
      reference,
      status: "pending",
      paystack_data: paystackData as Json,
    });
    if (insertError && !insertError.message.toLowerCase().includes("duplicate")) {
      secureLog("error", "paystack/external", "fulfillment_failed", {
        reference,
        reason: "transaction_insert_failed",
        error: insertError.message,
      });
      return {
        handled: true,
        ok: false,
        reference,
        error: insertError.message,
        permanent: false,
        status: 500,
      };
    }
  } else {
    await admin
      .from("transactions")
      .update({
        student_id: studentId,
        course_id: course.id,
        amount: product.expectedAmountKobo,
        currency: product.currency,
        paystack_data: {
          ...(existingTx.paystack_data as Record<string, unknown>),
          ...paystackData,
        } as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference);
  }

  const priorEnrollment = studentId
    ? await enrollmentExists(admin, studentId, course.id)
    : null;
  if (priorEnrollment) {
    secureLog("info", "paystack/external", "duplicate_enrollment", { reference, courseId: course.id });
    await admin
      .from("transactions")
      .update({ status: "success", student_id: studentId, course_id: course.id })
      .eq("reference", reference);
    await patchTransactionPaystackData(admin, reference, { fulfillment_status: "enrolled" });
  }

  try {
    if (!priorEnrollment) {
      await fulfillPurchase({
        studentId,
        courseId: course.id,
        reference,
        buyerEmail,
        buyerName: buyerName ?? undefined,
        skipCustomerEmails: true,
      });
      secureLog("info", "paystack/external", "enrollment_created", {
        reference,
        courseId: course.id,
      });
      await patchTransactionPaystackData(admin, reference, { fulfillment_status: "enrolled" });
    }

    const firstName = buyerName?.split(/\s+/)[0] || buyerEmail.split("@")[0] || "there";
    const emailResult = await sendAccessEmail({
      studentId,
      email: buyerEmail,
      firstName,
      courseId: course.id,
      courseTitle: course.title,
      isNewAccount,
    });

    await patchTransactionPaystackData(admin, reference, {
      fulfillment_status: emailResult.sent ? "email_sent" : "email_failed",
      access_email_sent_at: emailResult.sent ? new Date().toISOString() : null,
      fulfillment_error: emailResult.sent ? null : emailResult.error ?? "email_failed",
    });

    if (emailResult.sent) {
      secureLog("info", "paystack/external", "email_sent", { reference });
    } else {
      secureLog("warn", "paystack/external", "email_failed", {
        reference,
        error: emailResult.error,
      });
    }

    await logAudit({
      action: "paystack_external_enrolled",
      targetType: "course",
      targetId: course.id,
      metadata: {
        reference,
        productKey: product.key,
        email: buyerEmail,
        amount: product.expectedAmountKobo,
        currency: product.currency,
        fulfillmentStatus: emailResult.sent ? "email_sent" : "email_failed",
      } as Json,
    });

    return {
      handled: true,
      ok: true,
      reference,
      alreadyFulfilled: Boolean(priorEnrollment),
      productKey: product.key,
      courseId: course.id,
      studentId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    secureLog("error", "paystack/external", "fulfillment_failed", {
      reference,
      reason: "enrollment_failed",
      error: message,
    });
    await patchTransactionPaystackData(admin, reference, {
      fulfillment_status: "fulfillment_failed",
      fulfillment_error: message,
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: message,
      permanent: false,
      status: 500,
    };
  }
}
