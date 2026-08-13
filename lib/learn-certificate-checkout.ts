import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { initializeTransaction, generateReference, paystackConfigured } from "@/lib/paystack";
import { nairaToKobo } from "@/lib/currency";
import { siteUrl } from "@/lib/org";
import { isValidStudentEmail, findProfileByEmail } from "@/lib/admin-student-onboarding";
import { CHECKOUT_REF_COOKIE, checkoutRefCookieOptions, hashCheckoutBinding } from "@/lib/checkout-binding";
import { isMissingColumnError } from "@/lib/schema-guard";
import {
  buildLearningPathCheckoutPayload,
  loadPublishedPathCertificateOffer,
} from "@/lib/learn-certificates";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function initializeLearningPathCertificateCheckout(params: {
  admin: SupabaseClient<Database>;
  userId: string | null;
  profile: { email: string; full_name: string | null } | null;
  body: { learningPathId: string; email?: string; fullName?: string };
}) {
  const path = await loadPublishedPathCertificateOffer(params.admin, params.body.learningPathId);
  if (!path) {
    return jsonError("This learning path does not offer a paid certificate.", 404);
  }

  const chargeAmount = nairaToKobo(path.certificate_price_ngn ?? 0);
  if (chargeAmount <= 0) {
    return jsonError("Certificate price is not set.", 400);
  }

  if (!(await paystackConfigured())) {
    return jsonError(
      "Paystack is not configured. Save your Paystack secret key under Admin → Settings → Integrations.",
      503,
    );
  }

  let checkoutEmail = params.profile?.email?.trim().toLowerCase() ?? "";
  let checkoutName = params.profile?.full_name?.trim() ?? "";
  if (!checkoutEmail && params.body.email?.trim()) {
    checkoutEmail = params.body.email.trim().toLowerCase();
    checkoutName = params.body.fullName?.trim() ?? checkoutName;
  }

  if (!params.userId || !params.profile?.email) {
    if (!isValidStudentEmail(checkoutEmail)) {
      return jsonError("Enter your email address before checkout.", 400);
    }
    if (checkoutName.length < 2) {
      return jsonError("Enter your full name before checkout.", 400);
    }
  } else if (!checkoutEmail) {
    return jsonError("Add an email address to your profile before checkout.", 400);
  }

  if (isValidStudentEmail(checkoutEmail)) {
    const existingProfile = await findProfileByEmail(params.admin, checkoutEmail);
    if (existingProfile) {
      const { data: existingCert, error: certError } = await params.admin
        .from("certificates")
        .select("id")
        .eq("student_id", existingProfile.id)
        .eq("learning_path_id", path.id)
        .eq("is_valid", true)
        .maybeSingle();
      if (certError && !isMissingColumnError(certError.message)) {
        return jsonError(certError.message, 500);
      }
      if (existingCert) {
        return NextResponse.json({
          alreadyOwned: true,
          certificateId: existingCert.id,
          buyerEmail: checkoutEmail,
        });
      }
    }
  }

  const reference = generateReference();
  const storeCheckoutDetails = !params.userId || !params.profile?.email;
  const paystackData = buildLearningPathCheckoutPayload({
    learningPathId: path.id,
    checkoutEmail: storeCheckoutDetails ? checkoutEmail : undefined,
    checkoutName: storeCheckoutDetails ? checkoutName : undefined,
  });

  const { error: txError } = await params.admin.from("transactions").insert({
    student_id: params.userId,
    course_id: null,
    learning_path_id: path.id,
    amount: chargeAmount,
    currency: "NGN",
    reference,
    status: "pending",
    paystack_data: paystackData as Json,
  });

  if (txError) {
    if (isMissingColumnError(txError.message) || /learning_path_id|commerce_target/i.test(txError.message)) {
      return jsonError(
        "Learning path certificates are not enabled on this database yet. Apply sql/apply-learning-path-certificates.sql.",
        503,
      );
    }
    return jsonError(txError.message, 500);
  }

  const metadata: Record<string, string> = {
    learning_path_id: path.id,
    currency: "NGN",
    buyer_email: checkoutEmail,
    buyer_full_name: checkoutName,
  };
  if (params.userId) metadata.student_id = params.userId;

  let init;
  try {
    init = await initializeTransaction({
      email: checkoutEmail,
      amountMinor: chargeAmount,
      currency: "NGN",
      reference,
      callbackUrl: `${siteUrl()}/learn/${path.slug}?payment=success`,
      metadata,
      customerName: checkoutName || undefined,
    });
  } catch (err) {
    await params.admin.from("transactions").update({ status: "failed" }).eq("reference", reference);
    return jsonError(err instanceof Error ? err.message : "Paystack initialization failed.", 502);
  }

  const response = NextResponse.json({
    authorizationUrl: init.authorization_url,
    reference,
  });
  response.cookies.set(
    CHECKOUT_REF_COOKIE,
    hashCheckoutBinding(reference, checkoutEmail),
    checkoutRefCookieOptions(),
  );
  return response;
}
