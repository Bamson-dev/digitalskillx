import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  findProfileByEmail,
  generateStrongPassword,
  isValidStudentEmail,
  resolveCanonicalStudentId,
  syncStudentCourseAccess,
} from "@/lib/admin-student-onboarding";
import { fulfillPurchase, ensurePurchaseEnrollment } from "@/lib/purchase";
import { verifyTransaction, type VerifiedTransaction } from "@/lib/paystack";
import { runAutomations } from "@/lib/automation";
import type { Database } from "@/types/database";

export type CheckoutSession = {
  access_token: string;
  refresh_token: string;
};

const PLACEHOLDER_DOMAIN = "checkout.digitalskillx.com";

export type PendingCheckoutDetails = {
  checkout_email?: string;
  checkout_full_name?: string;
};

export function readPendingCheckoutDetails(
  paystackData: unknown,
): PendingCheckoutDetails {
  if (!paystackData || typeof paystackData !== "object") return {};
  const data = paystackData as PendingCheckoutDetails;
  return {
    checkout_email: data.checkout_email?.trim().toLowerCase(),
    checkout_full_name: data.checkout_full_name?.trim(),
  };
}

export function checkoutPlaceholderEmail(reference: string) {
  return `checkout+${reference}@${PLACEHOLDER_DOMAIN}`;
}

export function isCheckoutPlaceholderEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.startsWith("checkout+") &&
    normalized.endsWith(`@${PLACEHOLDER_DOMAIN}`)
  );
}

function buyerNameFromVerified(verified: VerifiedTransaction) {
  const first = verified.customer?.first_name?.trim() ?? "";
  const last = verified.customer?.last_name?.trim() ?? "";
  const combined = `${first} ${last}`.trim();
  return combined || null;
}

export async function resolveOrCreateStudentForPurchase(
  admin: SupabaseClient<Database>,
  params: { email: string; fullName?: string | null },
) {
  const email = params.email.trim().toLowerCase();
  if (!isValidStudentEmail(email)) {
    throw new Error("A valid email address is required to complete checkout.");
  }

  const existing = await findProfileByEmail(admin, email);
  if (existing) {
    if (existing.is_suspended) {
      throw new Error("This account is suspended. Contact support for help.");
    }

    const fullName = existing.full_name ?? params.fullName?.trim() ?? email.split("@")[0];
    if (!existing.full_name && params.fullName?.trim()) {
      await admin.from("profiles").update({ full_name: params.fullName.trim() }).eq("id", existing.id);
    }

    return {
      studentId: existing.id,
      email: existing.email,
      fullName,
      isNewAccount: false as const,
      password: undefined,
    };
  }

  const password = generateStrongPassword();
  const fullName = params.fullName?.trim() || email.split("@")[0];

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      const authExisting = await findProfileByEmail(admin, email);
      if (!authExisting) throw new Error(error.message);
      return {
        studentId: authExisting.id,
        email: authExisting.email,
        fullName: authExisting.full_name ?? fullName,
        isNewAccount: false as const,
        password: undefined,
      };
    }
    throw new Error(error.message);
  }

  await admin.from("profiles").upsert(
    {
      id: created.user.id,
      email,
      full_name: fullName,
      role: "student",
      is_suspended: false,
    },
    { onConflict: "id" },
  );
  await runAutomations("account_created", { studentId: created.user.id });

  return {
    studentId: created.user.id,
    email,
    fullName,
    isNewAccount: true as const,
    password,
  };
}

async function syncProfileEmailIfMissing(
  admin: SupabaseClient<Database>,
  studentId: string,
  email: string,
  fullName?: string | null,
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", studentId)
    .maybeSingle();

  if (!profile) return;

  const updates: { email?: string; full_name?: string } = {};
  if (!profile.email?.trim()) updates.email = email.trim().toLowerCase();
  if (!profile.full_name?.trim() && fullName?.trim()) updates.full_name = fullName.trim();

  if (Object.keys(updates).length > 0) {
    await admin.from("profiles").update(updates).eq("id", studentId);
  }
}

async function signInCheckoutUser(email: string, password: string): Promise<CheckoutSession | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const authClient = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.session) return null;

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

/** True when a Paystack reference completed successfully AND the student is enrolled. */
export async function isSuccessfulGuestPurchase(reference: string, courseId: string) {
  const admin = await createAdminClientAsync();
  const { data: tx } = await admin
    .from("transactions")
    .select("status, course_id, student_id")
    .eq("reference", reference)
    .maybeSingle();

  if (!tx || tx.status !== "success" || tx.course_id !== courseId || !tx.student_id) {
    return false;
  }

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", tx.student_id)
    .eq("course_id", courseId)
    .maybeSingle();

  return Boolean(enrollment);
}

/** Idempotent paid checkout completion for browser confirm + Paystack webhook. */
export async function completePaidCheckout(reference: string) {
  const admin = await createAdminClientAsync();
  const { data: tx } = await admin
    .from("transactions")
    .select("student_id, course_id, status, paystack_data, amount, currency")
    .eq("reference", reference)
    .maybeSingle();

  if (!tx) {
    return { ok: false as const, error: "Payment record not found.", status: 404 as const };
  }

  const repairEnrollmentIfNeeded = async (studentId: string | null) => {
    if (!studentId) return null;
    try {
      await ensurePurchaseEnrollment({ studentId, courseId: tx.course_id });
    } catch (err) {
      console.error("[completePaidCheckout] enrollment repair failed", reference, err);
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", studentId)
      .maybeSingle();
    return profile?.email ?? null;
  };

  if (tx.status === "success") {
    const email = await repairEnrollmentIfNeeded(tx.student_id);
    return {
      ok: true as const,
      alreadyFulfilled: true,
      courseId: tx.course_id,
      buyerEmail: email,
      isNewAccount: false,
    };
  }

  if (tx.status === "failed") {
    return {
      ok: false as const,
      error: "This payment was not successful. Start checkout again if you still need access.",
      status: 409 as const,
    };
  }

  const verified = await verifyTransaction(reference);
  if (!verified || verified.status !== "success") {
    return {
      ok: false as const,
      error: "Payment is still processing. Refresh in a moment or check your email for confirmation.",
      status: 409 as const,
    };
  }

  if (
    typeof tx.amount === "number" &&
    (verified.amount !== tx.amount ||
      verified.currency?.toUpperCase() !== String(tx.currency ?? "NGN").toUpperCase())
  ) {
    console.error("[completePaidCheckout] amount/currency mismatch", {
      reference,
      expectedAmount: tx.amount,
      expectedCurrency: tx.currency,
      verifiedAmount: verified.amount,
      verifiedCurrency: verified.currency,
    });
    return {
      ok: false as const,
      error: "Payment amount could not be verified. Contact support with your payment reference.",
      status: 409 as const,
      permanent: true as const,
    };
  }

  if (
    verified.metadata?.course_id &&
    verified.metadata.course_id !== tx.course_id
  ) {
    console.error("[completePaidCheckout] course metadata mismatch", reference);
    return {
      ok: false as const,
      error: "Payment does not match this course. Contact support with your payment reference.",
      status: 409 as const,
      permanent: true as const,
    };
  }

  const pending = readPendingCheckoutDetails(tx.paystack_data);
  const buyerEmail =
    pending.checkout_email ||
    verified.metadata?.buyer_email?.trim().toLowerCase() ||
    verified.customer?.email?.trim().toLowerCase() ||
    "";
  const buyerName =
    pending.checkout_full_name ||
    verified.metadata?.buyer_full_name?.trim() ||
    buyerNameFromVerified(verified);

  if (!buyerEmail || isCheckoutPlaceholderEmail(buyerEmail)) {
    return {
      ok: false as const,
      error: "Checkout email was not captured for this payment. Contact support with your payment reference.",
      status: 422 as const,
      permanent: true as const,
    };
  }

  let studentId = tx.student_id;
  let isNewAccount = false;
  let password: string | undefined;

  if (!studentId) {
    const resolved = await resolveOrCreateStudentForPurchase(admin, {
      email: buyerEmail,
      fullName: buyerName,
    });
    studentId = resolved.studentId;
    isNewAccount = resolved.isNewAccount;
    password = resolved.password;

    await admin.from("transactions").update({ student_id: studentId }).eq("reference", reference);
  } else {
    await syncProfileEmailIfMissing(admin, studentId, buyerEmail, buyerName);
  }

  const { data: profileRow } = await admin
    .from("profiles")
    .select("email")
    .eq("id", studentId)
    .maybeSingle();

  const checkoutEmail = buyerEmail || profileRow?.email?.trim().toLowerCase() || "";
  const canonicalStudentId = await resolveCanonicalStudentId(admin, {
    studentId,
    email: checkoutEmail,
  });
  studentId = await syncStudentCourseAccess(admin, {
    authUserId: canonicalStudentId,
    profileEmail: checkoutEmail || profileRow?.email,
  });

  if (studentId !== tx.student_id) {
    await admin.from("transactions").update({ student_id: studentId }).eq("reference", reference);
  }

  const fulfillResult = await fulfillPurchase({
    studentId,
    courseId: tx.course_id,
    reference,
    welcomePassword: password,
    buyerEmail,
    buyerName: buyerName ?? undefined,
  });

  let session: CheckoutSession | undefined;
  // Only auto-sign-in for brand-new accounts created in THIS fulfillment (not retries).
  if (isNewAccount && password && !fulfillResult.alreadyFulfilled) {
    session = (await signInCheckoutUser(buyerEmail, password)) ?? undefined;
  }

  return {
    ok: true as const,
    courseId: tx.course_id,
    buyerEmail,
    isNewAccount,
    session,
    alreadyFulfilled: fulfillResult.alreadyFulfilled,
  };
}
