import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initializeTransaction, generateReference, paystackConfigured } from "@/lib/paystack";
import { nairaToKobo } from "@/lib/currency";
import { siteUrl } from "@/lib/org";
import { isValidStudentEmail, findProfileByEmail, syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { CHECKOUT_REF_COOKIE, checkoutRefCookieOptions, hashCheckoutBinding } from "@/lib/checkout-binding";
import { resolveLiveOfferForCheckout } from "@/lib/commerce-offers";
import { bundleProvidesNewValue } from "@/lib/commerce-ownership";
import type { Json } from "@/types/database";

type InitArgs = {
  admin: SupabaseClient;
  userId: string | null;
  profile: { email: string; full_name: string | null } | null;
  body: {
    offerId?: string;
    bundleId?: string;
    couponCode?: string;
    email?: string;
    fullName?: string;
    attribution?: Record<string, string>;
  };
};

/**
 * Paid checkout for offers / bundles via existing Paystack initialize path.
 * Server resolves price — never trusts client amounts.
 */
export async function initializeCommerceCheckout(args: InitArgs): Promise<NextResponse> {
  const { admin, userId, profile, body } = args;

  if (!(await paystackConfigured())) {
    return NextResponse.json(
      {
        error:
          "Paystack is not configured. Save your Paystack secret key under Admin → Settings → Integrations, then open any admin page once (or redeploy with PAYSTACK_SECRET_KEY in Coolify Runtime).",
      },
      { status: 503 },
    );
  }

  let checkoutEmail = profile?.email?.trim().toLowerCase() ?? "";
  let checkoutName = profile?.full_name?.trim() ?? "";
  if (!checkoutEmail && body.email?.trim()) {
    checkoutEmail = body.email.trim().toLowerCase();
    checkoutName = body.fullName?.trim() ?? checkoutName;
  }
  if (!userId || !profile?.email) {
    if (!isValidStudentEmail(checkoutEmail)) {
      return NextResponse.json({ error: "Enter your email address before checkout." }, { status: 400 });
    }
    if (checkoutName.length < 2) {
      return NextResponse.json({ error: "Enter your full name before checkout." }, { status: 400 });
    }
  } else if (!checkoutEmail) {
    return NextResponse.json(
      { error: "Add an email address to your profile before enrolling." },
      { status: 400 },
    );
  }

  let chargeNgn = 0;
  let primaryCourseId: string | null = null;
  let bundleId: string | null = null;
  let digitalProductId: string | null = null;
  let offerId: string | null = null;
  let courseIds: string[] = [];
  let title = "DigitalSkillX purchase";
  let callbackPath = "/dashboard";
  let commerceKind: "offer" | "bundle" = "offer";

  if (body.offerId) {
    const resolved = await resolveLiveOfferForCheckout(admin, body.offerId, {
      couponCode: body.couponCode,
      studentId: userId,
    });
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    chargeNgn = resolved.chargeNgn;
    primaryCourseId = resolved.primaryCourseId;
    bundleId = resolved.bundleId;
    digitalProductId = resolved.digitalProductId;
    offerId = resolved.offer.id;
    courseIds = resolved.courseIds;
    title = resolved.offer.title;
    commerceKind = "offer";
    callbackPath = primaryCourseId
      ? `/course/${primaryCourseId}?payment=success`
      : `/purchase/success?payment=success`;
  } else if (body.bundleId) {
    const { data: bundle, error } = await admin
      .from("course_bundles")
      .select("id, title, price_ngn, is_active")
      .eq("id", body.bundleId)
      .maybeSingle();
    if (error || !bundle || !bundle.is_active) {
      return NextResponse.json({ error: "Bundle is not available." }, { status: 404 });
    }
    const { data: items } = await admin
      .from("course_bundle_items")
      .select("course_id, sort_order")
      .eq("bundle_id", bundle.id)
      .order("sort_order", { ascending: true });
    courseIds = (items ?? []).map((i) => i.course_id);
    if (!courseIds.length) {
      return NextResponse.json({ error: "Bundle has no courses." }, { status: 400 });
    }
    if (userId) {
      const hasValue = await bundleProvidesNewValue(admin, userId, courseIds);
      if (!hasValue) {
        return NextResponse.json(
          { error: "You already own every course in this bundle." },
          { status: 400 },
        );
      }
    }
    chargeNgn = Number(bundle.price_ngn) || 0;
    primaryCourseId = courseIds[0] ?? null;
    bundleId = bundle.id;
    title = bundle.title;
    commerceKind = "bundle";
    callbackPath = primaryCourseId
      ? `/course/${primaryCourseId}?payment=success`
      : `/purchase/success?payment=success`;
  } else {
    return NextResponse.json({ error: "offerId or bundleId is required." }, { status: 400 });
  }

  const chargeAmount = nairaToKobo(chargeNgn);
  if (chargeAmount <= 0) {
    return NextResponse.json({ error: "Price is not set." }, { status: 400 });
  }

  if (userId && primaryCourseId && courseIds.length === 1) {
    let canonical = userId;
    try {
      canonical = await syncStudentCourseAccess(admin, {
        authUserId: userId,
        profileEmail: profile?.email,
      });
    } catch {
      canonical = userId;
    }
    const { studentOwnsCourse } = await import("@/lib/commerce-ownership");
    if (await studentOwnsCourse(admin, canonical, primaryCourseId)) {
      return NextResponse.json({ enrolled: true });
    }
  }

  if (isValidStudentEmail(checkoutEmail) && primaryCourseId && courseIds.length === 1) {
    const existingProfile = await findProfileByEmail(admin, checkoutEmail);
    if (existingProfile) {
      const { studentOwnsCourse } = await import("@/lib/commerce-ownership");
      if (await studentOwnsCourse(admin, existingProfile.id, primaryCourseId)) {
        return NextResponse.json({ enrolled: true, buyerEmail: checkoutEmail });
      }
    }
  }

  const reference = generateReference();
  const attribution = body.attribution ?? {};
  const storeCheckoutDetails = !userId || !profile?.email;
  const paystackDataBase: Record<string, unknown> = {
    ...attribution,
    commerce: {
      kind: commerceKind,
      offer_id: offerId ?? undefined,
      bundle_id: bundleId ?? undefined,
      digital_product_id: digitalProductId ?? undefined,
      course_ids: courseIds,
    },
  };
  if (storeCheckoutDetails) {
    paystackDataBase.checkout_email = checkoutEmail;
    paystackDataBase.checkout_full_name = checkoutName;
  }

  const { error: txError } = await admin.from("transactions").insert({
    student_id: userId,
    course_id: primaryCourseId,
    offer_id: offerId,
    bundle_id: bundleId,
    digital_product_id: digitalProductId,
    amount: chargeAmount,
    currency: "NGN",
    reference,
    status: "pending",
    paystack_data: paystackDataBase as Json,
  });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const metadata: Record<string, string> = {
    currency: "NGN",
    buyer_email: checkoutEmail,
    buyer_full_name: checkoutName,
    title: title.slice(0, 100),
    ...attribution,
  };
  if (primaryCourseId) metadata.course_id = primaryCourseId;
  if (offerId) metadata.offer_id = offerId;
  if (bundleId) metadata.bundle_id = bundleId;
  if (digitalProductId) metadata.digital_product_id = digitalProductId;
  if (userId) metadata.student_id = userId;

  let init;
  try {
    init = await initializeTransaction({
      email: checkoutEmail,
      amountMinor: chargeAmount,
      currency: "NGN",
      reference,
      callbackUrl: `${siteUrl()}${callbackPath}`,
      metadata,
      customerName: checkoutName,
    });
  } catch (err) {
    await admin
      .from("transactions")
      .update({ status: "failed" })
      .eq("reference", reference)
      .eq("status", "pending");
    throw err;
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
