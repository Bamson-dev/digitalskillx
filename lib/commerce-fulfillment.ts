import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enrollStudentInBundle } from "@/lib/course-bundles";
import { grantDigitalProductEntitlement } from "@/lib/digital-products";
import { ensurePurchaseEnrollment, fulfillPurchase } from "@/lib/purchase";

export type CommerceCheckoutMeta = {
  kind: "course" | "bundle" | "offer" | "digital_product";
  offer_id?: string;
  bundle_id?: string;
  digital_product_id?: string;
  course_ids?: string[];
};

export function readCommerceMeta(paystackData: unknown): CommerceCheckoutMeta | null {
  if (!paystackData || typeof paystackData !== "object") return null;
  const bag = paystackData as Record<string, unknown>;
  const commerce = bag.commerce;
  if (!commerce || typeof commerce !== "object") return null;
  const c = commerce as Record<string, unknown>;
  const kind = c.kind;
  if (
    kind !== "course" &&
    kind !== "bundle" &&
    kind !== "offer" &&
    kind !== "digital_product"
  ) {
    return null;
  }
  const courseIds = Array.isArray(c.course_ids)
    ? c.course_ids.filter((x): x is string => typeof x === "string")
    : [];
  return {
    kind,
    offer_id: typeof c.offer_id === "string" ? c.offer_id : undefined,
    bundle_id: typeof c.bundle_id === "string" ? c.bundle_id : undefined,
    digital_product_id:
      typeof c.digital_product_id === "string" ? c.digital_product_id : undefined,
    course_ids: courseIds,
  };
}

/**
 * After verified payment: enroll courses / grant digital access using existing helpers.
 * Idempotent. Does not replace fulfillPurchase for single-course receipts — wraps it.
 */
export async function fulfillCommercePurchase(params: {
  admin: SupabaseClient;
  studentId: string;
  reference: string;
  primaryCourseId: string | null;
  welcomePassword?: string;
  buyerEmail?: string;
  buyerName?: string;
}) {
  const { data: tx } = await params.admin
    .from("transactions")
    .select(
      "id, course_id, bundle_id, digital_product_id, offer_id, paystack_data, status",
    )
    .eq("reference", params.reference)
    .maybeSingle();

  const meta = readCommerceMeta(tx?.paystack_data);
  const courseIds = new Set<string>();
  if (params.primaryCourseId) courseIds.add(params.primaryCourseId);
  if (tx?.course_id) courseIds.add(tx.course_id);
  for (const id of meta?.course_ids ?? []) courseIds.add(id);

  if (tx?.bundle_id) {
    const bundleResult = await enrollStudentInBundle(params.admin, {
      studentId: params.studentId,
      bundleId: tx.bundle_id,
      source: "purchase",
    });
    for (const id of bundleResult.enrolled) courseIds.add(id);
    for (const id of bundleResult.skipped) courseIds.add(id);
  }

  const primary =
    params.primaryCourseId ||
    tx?.course_id ||
    [...courseIds][0] ||
    null;

  // Claim transaction + receipt via existing fulfill for primary course when present
  if (primary) {
    for (const courseId of courseIds) {
      if (courseId === primary) continue;
      await ensurePurchaseEnrollment({
        studentId: params.studentId,
        courseId,
      });
    }
    return fulfillPurchase({
      studentId: params.studentId,
      courseId: primary,
      reference: params.reference,
      welcomePassword: params.welcomePassword,
      buyerEmail: params.buyerEmail,
      buyerName: params.buyerName,
    });
  }

  // Digital-only purchase (no course_id)
  if (tx?.digital_product_id) {
    const { data: claimed } = await params.admin
      .from("transactions")
      .update({ status: "success" })
      .eq("reference", params.reference)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    await grantDigitalProductEntitlement(params.admin, {
      studentId: params.studentId,
      digitalProductId: tx.digital_product_id,
      transactionId: tx.id,
    });

    return {
      fulfilled: true as const,
      alreadyFulfilled: !claimed,
      enrollmentId: null as string | null,
      digitalProductId: tx.digital_product_id,
    };
  }

  // Fallback: mark success if somehow already enrolled path
  await params.admin
    .from("transactions")
    .update({ status: "success" })
    .eq("reference", params.reference)
    .neq("status", "success");

  return {
    fulfilled: true as const,
    alreadyFulfilled: true,
    enrollmentId: null as string | null,
  };
}
