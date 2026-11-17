import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { resolveOrCreateStudentForPurchase } from "@/lib/guest-checkout";
import { generateStrongPassword } from "@/lib/admin-student-onboarding";
import { fulfillPurchase } from "@/lib/purchase";
import { sendMagicLinkEmail } from "@/lib/auth-email";
import { siteUrl } from "@/lib/org";
import { secureLog } from "@/lib/secure-log";
import {
  BUILD_SOFTWARE_WITH_AI_PRODUCT,
  configuredExternalCourseId,
  identifyPaystackExternalProduct,
  readExternalPaystackData,
  resolveExternalProductByKey,
  amountAndCurrencyMatchProduct,
  unattributedAmountCandidates,
  type ExternalPaystackData,
  type ExternalFulfillmentStatus,
  type PaystackExternalProduct,
  type PaystackChargePayload,
  PAYSTACK_EXTERNAL_PRODUCTS,
} from "@/lib/paystack-external-products";
import { sendPaystackCourseAccessEmail } from "@/lib/system-email-triggers";
import { trackExternalPurchase } from "@/lib/purchase-tracking";
import { verifyTransaction, type VerifiedTransaction } from "@/lib/paystack";
import {
  claimExternalPayment,
  isDuplicateKeyError,
  releaseClaim,
  renewClaim,
  type ClaimedTransactionRow,
} from "@/lib/paystack-external-claim";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type LeadthurHandoffPayment = {
  productKey: string;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string;
  paidAt?: string | null;
  leadthurEventId?: string;
};

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
  password?: string;
  skipMagicLink?: boolean;
}) {
  const base = siteUrl();
  const coursePath = `/courses/${params.courseId}`;
  const courseUrl = `${base}${coursePath}`;
  // Relative `next` so login always accepts it (absolute next broke older emails).
  const loginUrl = `${base}/login?next=${encodeURIComponent(coursePath)}`;

  // Prefer password credentials. Magic links are a fallback only when no password
  // was issued (legacy new-account path without credentials).
  if (params.isNewAccount && !params.password && !params.skipMagicLink) {
    void sendMagicLinkEmail(params.email, `/courses/${params.courseId}`).catch((err) => {
      secureLog("warn", "paystack/external", "magic_link_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return sendPaystackCourseAccessEmail({
    courseId: params.courseId,
    email: params.email,
    firstName: params.firstName,
    courseTitle: params.courseTitle,
    courseUrl,
    loginUrl,
    isNewAccount: params.isNewAccount,
    password: params.password,
  });
}

async function issueStudentLoginPassword(
  admin: Admin,
  studentId: string,
): Promise<string> {
  const password = generateStrongPassword();
  const { error } = await admin.auth.admin.updateUserById(studentId, {
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  return password;
}


export type ExternalFulfillmentDeps = {
  verifyTransaction: typeof verifyTransaction;
  resolveStudent: typeof resolveOrCreateStudentForPurchase;
  enroll: typeof fulfillPurchase;
  sendAccessEmail: typeof sendAccessEmail;
  trackPurchase: typeof trackExternalPurchase;
  audit: typeof logAudit;
};

const defaultDeps: ExternalFulfillmentDeps = {
  verifyTransaction,
  resolveStudent: resolveOrCreateStudentForPurchase,
  enroll: fulfillPurchase,
  sendAccessEmail,
  trackPurchase: trackExternalPurchase,
  audit: logAudit,
};

type HeldStatus = "awaiting_course_publish" | "attribution_required";

/**
 * Persist a verified payment that cannot be fulfilled yet. The row stays `pending`, has no
 * student and never sends access. It keeps the Paystack reference so a later reconcile run can
 * re-verify and fulfil it. A row that is already `success` is never touched.
 */
async function recordHeldPayment(
  admin: Admin,
  params: {
    reference: string;
    courseId: string;
    amountKobo: number;
    currency: string;
    held: HeldStatus;
    reason: string;
    data: Record<string, unknown>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const data: Record<string, unknown> = {
    ...params.data,
    fulfillment_status: params.held,
    fulfillment_error: params.reason,
    held_at: new Date().toISOString(),
  };
  const { error } = await admin.from("transactions").insert({
    student_id: null,
    course_id: params.courseId,
    amount: params.amountKobo,
    currency: params.currency,
    provider: "paystack" as const,
    reference: params.reference,
    status: "pending" as const,
    paystack_data: data as Json,
  });
  if (!error) return { ok: true };
  if (!isDuplicateKeyError(error)) return { ok: false, error: error.message };

  const { data: existing } = await admin
    .from("transactions")
    .select("status, paystack_data")
    .eq("reference", params.reference)
    .maybeSingle();
  if (!existing || existing.status === "success") return { ok: true };
  const prior =
    existing.paystack_data && typeof existing.paystack_data === "object"
      ? (existing.paystack_data as Record<string, unknown>)
      : {};
  const priorStatus = String(prior.fulfillment_status ?? "");
  if (priorStatus === "enrolled" || priorStatus === "email_sent") return { ok: true };
  await admin
    .from("transactions")
    .update({
      paystack_data: { ...prior, ...data, held_at: prior.held_at ?? data.held_at } as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("reference", params.reference)
    .eq("status", "pending");
  return { ok: true };
}

function busyResult(reference: string): ExternalFulfillmentResult {
  return {
    handled: true,
    ok: false,
    reference,
    error: "Fulfillment for this payment is already in progress.",
    permanent: false,
    status: 503,
  };
}

/**
 * Fulfill Paystack Payment Page purchases (e.g. paystack.shop/pay/ai-app).
 *
 * Idempotency is atomic. The first caller to insert the unique transaction reference owns a
 * lease. Concurrent deliveries get a retryable 503 and perform no side effect. Only the lease
 * holder enrols, sends the access email and tracks the Purchase.
 *
 * Fulfilment requires: a Paystack-verified success (or a signed Leadthur handoff), a product
 * proven by evidence or by an operator attribution, and an exact amount and currency match.
 */
export async function fulfillPaystackExternalCharge(params: {
  reference: string;
  webhookEvent?: string;
  webhookData?: PaystackChargePayload | null;
  /** When set (admin recovery / signed webhook fallback), skip live Paystack verify. */
  verifiedOverride?: VerifiedTransaction | null;
  /** Resend access email even if access_email_sent_at is already set. */
  forceEmail?: boolean;
  /**
   * Always set a fresh login password and include it in the access email.
   * Used by admin Manual Track so recipients get platform credentials, not only a link.
   */
  issueLoginPassword?: boolean;
  handoffPayment?: LeadthurHandoffPayment;
  /**
   * Trusted internal product attribution (operator action or a product key this system
   * recorded earlier after evidence). The payment is still verified with Paystack and must
   * match the product price and currency exactly. Never populate this from a webhook body.
   */
  attributedProductKey?: string;
  admin?: Admin;
  skipPurchaseTracking?: boolean;
  deps?: Partial<ExternalFulfillmentDeps>;
}): Promise<ExternalFulfillmentResult> {
  const admin = params.admin ?? (await createAdminClientAsync());
  const deps: ExternalFulfillmentDeps = { ...defaultDeps, ...(params.deps ?? {}) };
  const reference = params.reference.trim();
  if (!reference) return { handled: false };

  const handoff = params.handoffPayment;
  const logSource = handoff ? "leadthur/handoff" : "paystack/external";

  secureLog("info", logSource, "payment_received", {
    reference,
    event: params.webhookEvent ?? "charge.success",
    source: handoff ? "leadthur-paystack-router" : "paystack",
  });

  let product: PaystackExternalProduct | null = null;
  let buyerEmail = "";
  let verifiedClientIp: string | null = null;
  let buyerName: string | null = null;
  let paystackSource: ExternalPaystackData["source"] = "paystack_payment_page";
  let verifiedAmount = 0;
  let verifiedCurrency = "NGN";

  if (handoff) {
    if (handoff.status !== "success") {
      secureLog("warn", logSource, "payment_rejected", {
        reference,
        reason: "not_success",
        status: handoff.status,
      });
      return {
        handled: true,
        ok: false,
        reference,
        error: `Payment status is ${handoff.status}.`,
        permanent: handoff.status === "failed",
        status: handoff.status === "failed" ? 200 : 422,
      };
    }

    product = resolveExternalProductByKey(handoff.productKey);
    if (!product) {
      secureLog("warn", logSource, "product_rejected", {
        reference,
        reason: "unknown_product_key",
        productKey: handoff.productKey,
      });
      return {
        handled: true,
        ok: false,
        reference,
        error: "Unknown product key.",
        permanent: true,
        status: 422,
      };
    }

    if (!amountAndCurrencyMatchProduct(handoff.amount, handoff.currency, product)) {
      secureLog("warn", logSource, "payment_rejected", {
        reference,
        reason: "amount_or_currency_mismatch",
        amount: handoff.amount,
        currency: handoff.currency,
      });
      return {
        handled: true,
        ok: false,
        reference,
        error: "Payment amount or currency does not match product.",
        permanent: true,
        status: 422,
      };
    }

    verifiedAmount = handoff.amount;
    verifiedCurrency = handoff.currency.toUpperCase();
    buyerEmail = handoff.customerEmail.trim().toLowerCase();
    paystackSource = "leadthur-paystack-router";
    secureLog("info", logSource, "payment_verified", {
      reference,
      productKey: product.key,
      eventId: handoff.leadthurEventId ?? null,
    });
  } else {
    const verified =
      params.verifiedOverride ?? (await deps.verifyTransaction(reference, admin));
    if (!verified) {
      secureLog("warn", logSource, "payment_rejected", {
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

    if (verified.reference && verified.reference !== reference) {
      secureLog("warn", logSource, "payment_rejected", {
        reference,
        reason: "reference_mismatch",
      });
      return {
        handled: true,
        ok: false,
        reference,
        error: "Verified transaction reference does not match.",
        permanent: true,
        status: 422,
      };
    }

    if (verified.status !== "success") {
      secureLog("warn", logSource, "payment_rejected", {
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

    verifiedClientIp = (verified as { ip_address?: string | null }).ip_address ?? null;
    verifiedAmount = verified.amount;
    verifiedCurrency = String(verified.currency ?? "NGN").toUpperCase();
    buyerEmail =
      verified.metadata?.buyer_email?.trim().toLowerCase() ||
      verified.customer?.email?.trim().toLowerCase() ||
      params.webhookData?.customer?.email?.trim().toLowerCase() ||
      "";
    buyerName = buyerNameFromCharge(params.webhookData ?? null, verified.customer);

    if (params.attributedProductKey) {
      product = resolveExternalProductByKey(params.attributedProductKey);
      if (!product) {
        return {
          handled: true,
          ok: false,
          reference,
          error: "Unknown product key.",
          permanent: true,
          status: 422,
        };
      }
    } else {
      const identityInput = { verified, webhookData: params.webhookData ?? null };
      product = identifyPaystackExternalProduct(identityInput);
      if (!product) {
        const candidates = unattributedAmountCandidates(identityInput);
        if (candidates.length === 0) {
          secureLog("info", logSource, "payment_rejected", {
            reference,
            reason: "unknown_product",
            amount: verified.amount,
            currency: verified.currency,
          });
          return { handled: false };
        }
        // Paid, verified, but the payload names no product. Keep the money traceable and
        // wait for operator attribution. Never guess from the amount.
        const holdCourse = await resolveCourseForProduct(
          admin,
          candidates[0].key,
          configuredExternalCourseId(candidates[0]),
        );
        if (!holdCourse) return { handled: false };
        const held = await recordHeldPayment(admin, {
          reference,
          courseId: holdCourse.id,
          amountKobo: verifiedAmount,
          currency: verifiedCurrency,
          held: "attribution_required",
          reason: "product_not_confirmed",
          data: {
            source: "paystack_payment_page",
            product_key: "unattributed",
            payment_page: "",
            candidate_product_keys: candidates.map((row) => row.key),
            customer_email: buyerEmail || null,
            paystack_transaction_id: params.webhookData?.id ?? null,
            webhook_event: params.webhookEvent ?? "charge.success",
            paid_at: params.webhookData?.paid_at ?? null,
          },
        });
        secureLog("warn", logSource, "payment_held_unattributed", {
          reference,
          candidates: candidates.map((row) => row.key),
          recorded: held.ok,
        });
        return {
          handled: true,
          ok: false,
          reference,
          error: "Payment recorded. Product could not be confirmed from the payment.",
          permanent: held.ok,
          status: held.ok ? 422 : 500,
        };
      }
    }

    // Defense in depth: never fulfil a product at a price that was not paid.
    if (!amountAndCurrencyMatchProduct(verified.amount, verified.currency, product)) {
      secureLog("warn", logSource, "payment_rejected", {
        reference,
        reason: "amount_or_currency_mismatch",
        amount: verified.amount,
        currency: verified.currency,
        productKey: product.key,
      });
      return {
        handled: true,
        ok: false,
        reference,
        error: "Payment amount or currency does not match product.",
        permanent: true,
        status: 422,
      };
    }

    secureLog("info", logSource, "payment_verified", {
      reference,
      productKey: product.key,
      verifiedVia: params.verifiedOverride ? "override" : "paystack_api",
    });
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

  const baseData: Record<string, unknown> = {
    source: paystackSource,
    product_key: product.key,
    payment_page: product.paymentPageUrl,
    paystack_transaction_id: params.webhookData?.id ?? null,
    webhook_event: params.webhookEvent ?? "charge.success",
    paid_at: handoff?.paidAt ?? params.webhookData?.paid_at ?? new Date().toISOString(),
    customer_email: buyerEmail || null,
    leadthur_event_id: handoff?.leadthurEventId ?? null,
  };

  if (course.visibility !== "published") {
    // Draft course. Record the verified payment so it is never lost. Do not enrol, do not
    // email access and do not mark success. The reconcile job fulfils it after publish.
    const held = await recordHeldPayment(admin, {
      reference,
      courseId: course.id,
      amountKobo: product.expectedAmountKobo,
      currency: product.currency,
      held: "awaiting_course_publish",
      reason: "course_not_published",
      data: baseData,
    });
    secureLog("error", logSource, "payment_held_course_not_published", {
      reference,
      courseId: course.id,
      recorded: held.ok,
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: held.ok
        ? "Course is not published. Payment recorded, enrolment pending."
        : "Course is not published and the payment could not be recorded.",
      permanent: held.ok,
      status: held.ok ? 422 : 500,
    };
  }

  // Cheap exit for a payment that is completely fulfilled. No claim, no side effect.
  const { data: settledTx } = await admin
    .from("transactions")
    .select("status, student_id, course_id, paystack_data")
    .eq("reference", reference)
    .maybeSingle();
  const settledMeta = readExternalPaystackData(settledTx?.paystack_data);
  if (
    settledTx?.status === "success" &&
    settledTx.student_id &&
    settledTx.course_id &&
    settledMeta?.access_email_sent_at &&
    (params.skipPurchaseTracking || settledMeta.purchase_tracking_sent_at) &&
    !params.forceEmail &&
    !params.issueLoginPassword &&
    (await enrollmentExists(admin, settledTx.student_id, settledTx.course_id))
  ) {
    secureLog("info", "paystack/external", "duplicate_payment", { reference });
    return {
      handled: true,
      ok: true,
      reference,
      alreadyFulfilled: true,
      productKey: product.key,
      courseId: settledTx.course_id,
      studentId: settledTx.student_id,
    };
  }

  // Atomic claim on the unique reference. Exactly one concurrent caller proceeds.
  const claim = await claimExternalPayment(admin, {
    reference,
    insertRow: {
      student_id: null,
      course_id: course.id,
      amount: product.expectedAmountKobo,
      currency: product.currency,
      provider: "paystack",
      reference,
      status: "pending",
      paystack_data: {
        ...baseData,
        fulfillment_status: "payment_verified" as ExternalFulfillmentStatus,
      },
    },
  });
  if (claim.kind === "busy") {
    secureLog("info", logSource, "fulfillment_busy", { reference });
    return busyResult(reference);
  }
  if (claim.kind === "error") {
    secureLog("error", "paystack/external", "fulfillment_failed", {
      reference,
      reason: "claim_failed",
      error: claim.message,
    });
    return {
      handled: true,
      ok: false,
      reference,
      error: claim.message,
      permanent: false,
      status: 500,
    };
  }

  try {
    return await runClaimedFulfillment({
      admin,
      deps,
      claimId: claim.claimId,
      existingTx: claim.row,
      params,
      reference,
      logSource,
      product,
      course,
      baseData,
      buyerEmail,
      buyerName,
      verifiedClientIp,
      paystackSource,
    });
  } finally {
    await releaseClaim(admin, reference, claim.claimId).catch(() => undefined);
  }
}

type ClaimedRunInput = {
  admin: Admin;
  deps: ExternalFulfillmentDeps;
  claimId: string;
  existingTx: ClaimedTransactionRow;
  params: Parameters<typeof fulfillPaystackExternalCharge>[0];
  reference: string;
  logSource: string;
  product: PaystackExternalProduct;
  course: { id: string; title: string };
  baseData: Record<string, unknown>;
  buyerEmail: string;
  buyerName: string | null;
  verifiedClientIp: string | null;
  paystackSource: ExternalPaystackData["source"];
};

async function runClaimedFulfillment(input: ClaimedRunInput): Promise<ExternalFulfillmentResult> {
  const { admin, deps, claimId, existingTx, params, reference, product, course, buyerEmail, buyerName } =
    input;
  const handoff = params.handoffPayment;
  const externalMeta = readExternalPaystackData(existingTx.paystack_data);

  const stillOwner = () => renewClaim(admin, reference, claimId);

  if (existingTx.status === "success" && existingTx.student_id && existingTx.course_id) {
    const enrolled = await enrollmentExists(admin, existingTx.student_id, existingTx.course_id);
    if (enrolled) {
      secureLog("info", "paystack/external", "duplicate_payment", { reference });
      const needsEmail =
        (!externalMeta?.access_email_sent_at || params.forceEmail || params.issueLoginPassword) &&
        buyerEmail;
      if (needsEmail) {
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", existingTx.student_id)
          .maybeSingle();
        let password: string | undefined;
        if (params.issueLoginPassword) {
          try {
            password = await issueStudentLoginPassword(admin, existingTx.student_id);
          } catch (err) {
            return {
              handled: true,
              ok: false,
              reference,
              error: err instanceof Error ? err.message : "Could not issue login password.",
              permanent: false,
              status: 500,
            };
          }
        }
        if (!(await stillOwner())) return busyResult(reference);
        const emailResult = await deps.sendAccessEmail({
          studentId: existingTx.student_id,
          email: buyerEmail,
          firstName: profile?.full_name?.split(/\s+/)[0] ?? "there",
          courseId: existingTx.course_id,
          courseTitle: course.title,
          isNewAccount: Boolean(password),
          password,
          skipMagicLink: true,
        });
        await patchTransactionPaystackData(admin, reference, {
          fulfillment_status: emailResult.sent ? "email_sent" : "email_failed",
          access_email_sent_at: emailResult.sent ? new Date().toISOString() : null,
          fulfillment_error: emailResult.sent ? null : emailResult.error ?? "email_failed",
        });
        if (!emailResult.sent) {
          return {
            handled: true,
            ok: false,
            reference,
            error: emailResult.error ?? "Access email failed to send.",
            permanent: false,
            status: 500,
          };
        }
      }
      // Purchase tracking may still be owed from an earlier delivery.
      await trackPurchaseOnce({
        input,
        externalMeta: readExternalPaystackData(
          (
            await admin
              .from("transactions")
              .select("paystack_data")
              .eq("reference", reference)
              .maybeSingle()
          ).data?.paystack_data,
        ),
        stillOwner,
      });
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

  let studentId: string | null = existingTx.student_id ?? null;
  let isNewAccount = false;
  let loginPassword: string | undefined;

  try {
    const resolved = await deps.resolveStudent(admin, {
      email: buyerEmail,
      fullName: buyerName,
    });
    studentId = resolved.studentId;
    isNewAccount = resolved.isNewAccount;
    loginPassword = resolved.password;
    if (params.issueLoginPassword) {
      // Manual track always emails a fresh password so the buyer can log in.
      loginPassword = await issueStudentLoginPassword(admin, studentId);
      isNewAccount = true;
    }
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
    ...input.baseData,
    fulfillment_status: "payment_verified" as ExternalFulfillmentStatus,
    checkout_email: buyerEmail,
    checkout_full_name: buyerName,
    ...(params.webhookData ?? {}),
    // Keep ownership and identity fields out of reach of the webhook spread above.
    source: input.paystackSource,
    product_key: product.key,
  };

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
      await deps.enroll({
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
    let emailResult: { sent: boolean; error?: string | null } = { sent: true };
    if (!externalMeta?.access_email_sent_at || params.forceEmail || params.issueLoginPassword) {
      if (!(await stillOwner())) return busyResult(reference);
      emailResult = await deps.sendAccessEmail({
        studentId,
        email: buyerEmail,
        firstName,
        courseId: course.id,
        courseTitle: course.title,
        isNewAccount: isNewAccount || Boolean(loginPassword),
        password: loginPassword,
        skipMagicLink:
          Boolean(loginPassword) ||
          Boolean(params.issueLoginPassword) ||
          Boolean(params.verifiedOverride) ||
          Boolean(params.forceEmail),
      });
    } else {
      secureLog("info", "paystack/external", "duplicate_email_skipped", { reference });
    }

    await patchTransactionPaystackData(admin, reference, {
      fulfillment_status: emailResult.sent ? "email_sent" : "email_failed",
      access_email_sent_at: emailResult.sent ? new Date().toISOString() : null,
      fulfillment_error: emailResult.sent ? null : emailResult.error ?? "email_failed",
    });

    if (emailResult.sent) {
      secureLog("info", "paystack/external", "email_sent", { reference });
      await trackPurchaseOnce({ input, externalMeta, stillOwner });
    } else {
      secureLog("warn", "paystack/external", "email_failed", {
        reference,
        error: emailResult.error,
      });
      // Enrollment succeeded; ask Paystack to retry so access email is resent.
      return {
        handled: true,
        ok: false,
        reference,
        error: emailResult.error ?? "Access email failed to send.",
        permanent: false,
        status: 500,
      };
    }

    await deps.audit({
      action: "paystack_external_enrolled",
      targetType: "course",
      targetId: course.id,
      metadata: {
        reference,
        productKey: product.key,
        email: buyerEmail,
        amount: product.expectedAmountKobo,
        currency: product.currency,
        fulfillmentStatus: "email_sent",
        via: handoff ? "leadthur_handoff" : params.attributedProductKey ? "attributed" : "evidence",
      } as Json,
    });

    return {
      handled: true,
      ok: true,
      reference,
      alreadyFulfilled: Boolean(priorEnrollment),
      productKey: product.key,
      courseId: course.id,
      studentId: studentId as string,
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

/** Track the Purchase once. Only the claim holder reaches this. Meta also dedups on event_id. */
async function trackPurchaseOnce(args: {
  input: ClaimedRunInput;
  externalMeta: ExternalPaystackData | null;
  stillOwner: () => Promise<boolean>;
}) {
  const { input, externalMeta, stillOwner } = args;
  const { admin, deps, params, reference, product, buyerEmail } = input;
  if (params.skipPurchaseTracking || externalMeta?.purchase_tracking_sent_at) return;
  if (!(await stillOwner())) return;
  const tracking = await deps.trackPurchase({
    reference,
    customerEmail: buyerEmail,
    clientIpAddress: input.verifiedClientIp,
    product,
  });
  // Record "sent" only when Meta accepted the event. A skipped (no token) or failed send
  // stays unmarked, so a later delivery of this payment retries it.
  if (tracking.meta === "sent") {
    await patchTransactionPaystackData(admin, reference, {
      purchase_tracking_sent_at: new Date().toISOString(),
    });
  } else {
    secureLog("warn", "paystack/external", "purchase_tracking_not_recorded", {
      reference,
      meta: tracking.meta,
    });
  }
}
