import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  findProfileByEmail,
  generateStrongPassword,
  isValidStudentEmail,
} from "@/lib/admin-student-onboarding";
import { fulfillPurchase } from "@/lib/purchase";
import { verifyTransaction, type VerifiedTransaction } from "@/lib/paystack";
import { runAutomations } from "@/lib/automation";
import type { Database } from "@/types/database";

const PLACEHOLDER_DOMAIN = "checkout.digitalskillx.com";

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

  await admin.from("profiles").update({ full_name: fullName }).eq("id", created.user.id);
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

/** Idempotent paid checkout completion for browser confirm + Paystack webhook. */
export async function completePaidCheckout(reference: string) {
  const admin = await createAdminClientAsync();
  const { data: tx } = await admin
    .from("transactions")
    .select("student_id, course_id, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!tx) {
    return { ok: false as const, error: "Payment record not found.", status: 404 as const };
  }

  if (tx.status === "success") {
    const email = tx.student_id
      ? (
          await admin.from("profiles").select("email").eq("id", tx.student_id).maybeSingle()
        ).data?.email ?? null
      : null;
    return {
      ok: true as const,
      alreadyFulfilled: true,
      courseId: tx.course_id,
      buyerEmail: email,
      isNewAccount: false,
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

  const buyerEmail = verified.customer?.email?.trim().toLowerCase() ?? "";
  if (!buyerEmail || isCheckoutPlaceholderEmail(buyerEmail)) {
    return {
      ok: false as const,
      error: "Paystack did not return a customer email for this payment.",
      status: 422 as const,
    };
  }

  const buyerName = buyerNameFromVerified(verified);
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

  await fulfillPurchase({
    studentId,
    courseId: tx.course_id,
    reference,
    welcomePassword: password,
    buyerEmail,
  });

  return {
    ok: true as const,
    courseId: tx.course_id,
    buyerEmail,
    isNewAccount,
  };
}
